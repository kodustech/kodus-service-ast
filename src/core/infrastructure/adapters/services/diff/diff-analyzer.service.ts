import { Inject, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service';
import {
    EnrichedGraphEdge,
    EnrichedGraphNode,
    FunctionAnalysis,
    GetGraphsResponseData,
    NodeType,
    Point,
    Range,
    RelationshipType,
    RepositoryData,
} from '@kodus/kodus-proto/ast/v2';
import {
    ChangeResult,
    DiffHunk,
    ExtendedFunctionInfo,
} from '@/core/domain/diff/types/diff-analyzer.types';
import * as path from 'path';
import { parsePatch } from 'diff';
import {
    REPOSITORY_MANAGER_TOKEN,
    IRepositoryManager,
} from '@/core/domain/repository/contracts/repository-manager.contract';
import {
    getLanguageConfigForFilePath,
    LanguageConfig,
} from '@/core/domain/parsing/types/supported-languages';

enum RelatedNodeDirection {
    TO,
    FROM,
}

@Injectable()
export class DiffAnalyzerService {
    constructor(
        @Inject(REPOSITORY_MANAGER_TOKEN)
        private readonly repositoryManagerService: IRepositoryManager,

        private readonly logger: PinoLoggerService,
    ) {}

    async getRelevantContent(
        filePath: string,
        diff: string,
        graphs: GetGraphsResponseData,
        repoData: RepositoryData,
    ): Promise<string> {
        if (!filePath || filePath.length === 0 || !path.isAbsolute(filePath)) {
            this.logger.error({
                context: DiffAnalyzerService.name,
                message: `File path not provided or is not absolute: ${filePath}`,
                metadata: { filePath },
                serviceName: DiffAnalyzerService.name,
            });
            return '';
        }

        const languageConfig = getLanguageConfigForFilePath(filePath);
        if (!languageConfig) {
            this.logger.error({
                context: DiffAnalyzerService.name,
                message: `No language config found for file: ${filePath}`,
                metadata: { filePath },
                serviceName: DiffAnalyzerService.name,
            });
            return '';
        }

        const metadata = {
            filePath: filePath || 'unknown',
            diff: diff ? diff.slice(0, 100) : 'no diff provided',
        };

        try {
            if (!graphs) {
                this.logger.error({
                    context: DiffAnalyzerService.name,
                    message: `Content or graphs not provided`,
                    metadata,
                    serviceName: DiffAnalyzerService.name,
                });
                return null;
            }

            const mainFileContent =
                await this.repositoryManagerService.readFile({
                    repoData,
                    filePath,
                    absolute: true,
                });

            if (!mainFileContent) {
                this.logger.error({
                    context: DiffAnalyzerService.name,
                    message: `No content found for file ${filePath}`,
                    metadata,
                    serviceName: DiffAnalyzerService.name,
                });
                return null;
            }

            const ranges = this.getModifiedRanges(diff, mainFileContent);
            if (ranges.length === 0) {
                this.logger.warn({
                    context: DiffAnalyzerService.name,
                    message: `No relevant ranges found in diff`,
                    metadata,
                    serviceName: DiffAnalyzerService.name,
                });
                return null;
            }

            const mainFileNodes = this.getFileNodes(graphs, filePath);
            if (mainFileNodes.length === 0) {
                this.logger.warn({
                    context: DiffAnalyzerService.name,
                    message: `No file nodes found for ${filePath}`,
                    metadata,
                    serviceName: DiffAnalyzerService.name,
                });
                return null;
            }

            const mainNodes = this.getNodesForRanges(mainFileNodes, ranges);
            if (mainNodes.length === 0) {
                this.logger.warn({
                    context: DiffAnalyzerService.name,
                    message: `No nodes found for ranges`,
                    metadata,
                    serviceName: DiffAnalyzerService.name,
                });
                return null;
            }

            const relationships = graphs.enrichHeadGraph.relationships;
            const withRelated = mainNodes.flatMap((node) => {
                const relatedNodes = this.getRelatedNodes(
                    graphs.enrichHeadGraph.nodes,
                    relationships,
                    node,
                    filePath,
                );

                return [...relatedNodes, node];
            });

            const groupedByFilePath = withRelated.reduce(
                (accumulator, node) => {
                    const key = node.filePath;

                    if (!accumulator[key]) {
                        accumulator[key] = [];
                    }

                    accumulator[key].push(node);

                    return accumulator;
                },
                {} as Record<string, EnrichedGraphNode[]>,
            );

            const result: string[] = [];
            for (const [file, nodes] of Object.entries(groupedByFilePath)) {
                let fileContent: string;
                if (file === filePath) {
                    fileContent = mainFileContent;
                } else {
                    // If the node is from a different file, read that file's content
                    fileContent = await this.repositoryManagerService.readFile({
                        repoData,
                        filePath: file,
                        absolute: true,
                    });
                }

                if (!fileContent) {
                    this.logger.warn({
                        context: DiffAnalyzerService.name,
                        message: `No content found for file ${file}`,
                        metadata,
                        serviceName: DiffAnalyzerService.name,
                    });
                    continue;
                }

                let fileNodes: EnrichedGraphNode[];
                if (file === filePath) {
                    // Use the main file nodes if it's the same file
                    fileNodes = mainFileNodes;
                } else {
                    // Otherwise, get the nodes for the other file
                    fileNodes = this.getFileNodes(graphs, file);
                }

                const nodesRanges = nodes.flatMap((node) =>
                    this.getNodeRanges(
                        node,
                        fileNodes,
                        relationships,
                        fileContent,
                        file,
                        languageConfig,
                    ),
                );

                const mergedRanges = this.mergeRanges(nodesRanges);

                const rangeContent = this.contentFromRanges(
                    fileContent,
                    mergedRanges,
                    languageConfig,
                );

                result.push(`<-- ${file} -->\n${rangeContent}`);
            }

            return result.join('\n\n');
        } catch (error) {
            this.logger.error({
                context: DiffAnalyzerService.name,
                message: `Failed to get relevant content`,
                error,
                metadata,
                serviceName: DiffAnalyzerService.name,
            });
            return null;
        }
    }

    private contentFromRanges(
        content: string,
        ranges: Range[],
        languageConfig: LanguageConfig,
    ): string {
        if (!content || !ranges || ranges.length === 0) {
            this.logger.warn({
                context: DiffAnalyzerService.name,
                message: `No content or ranges provided`,
                serviceName: DiffAnalyzerService.name,
            });
            return '';
        }

        const sorted = [...ranges].sort((a, b) => a.startIndex - b.startIndex);

        const numberedSlices = sorted.flatMap((r) => {
            // pull the raw substring
            const raw = content.substring(r.startIndex, r.endIndex);
            const lines = raw.split('\n');

            // find the last line that contains code
            const lastCodeLineIndex = lines.findLastIndex((line) => {
                const trimmed = line.trim();

                const isComment = languageConfig.properties.comments.some(
                    (comment) => trimmed.startsWith(comment),
                );

                return trimmed !== '' && !isComment;
            });

            if (lastCodeLineIndex === -1) {
                // If there are no code lines, ignore
                return [];
            }

            const relevantLines = lines.slice(0, lastCodeLineIndex + 1);

            // determine the first line number in this slice
            const firstLineNum = (r.startPosition?.row ?? 0) + 1;

            let isPreamble = true;

            // split into lines and prefix each with its real line number
            return [
                relevantLines
                    .flatMap((line, idx) => {
                        if (isPreamble && line.trim() === '') {
                            // skip empty lines at the start
                            return [];
                        }

                        isPreamble = false;

                        const lineNumber = firstLineNum + idx;

                        return [`${lineNumber}: ${line}`.trim()];
                    })
                    .join('\n'),
            ];
        });

        const message = `\n<- CUT CONTENT ->\n`;

        let result = numberedSlices.join(`\n${message}\n`);

        // If the first range doesn't start at line 1, add the message at the start
        if ((sorted[0].startPosition?.row ?? 0) > 0) {
            result = `${message}\n${result}`;
        }

        // If the last range doesn't end at the last line, add the message at the end
        const contentLines = content.split('\n');
        const lastRange = sorted[sorted.length - 1];
        if ((lastRange.endPosition?.row ?? 0) < contentLines.length - 1) {
            const remainingContent = contentLines
                .slice((lastRange.endPosition?.row ?? 0) + 1)
                .join('\n')
                .trim();
            if (remainingContent) {
                result = `${result}\n${message}`;
            }
        }

        return result;
    }

    private getNodeRanges(
        node: EnrichedGraphNode,
        fileNodes: EnrichedGraphNode[],
        relationships: EnrichedGraphEdge[],
        content: string,
        filePath: string,
        languageConfig: LanguageConfig,
    ): Range[] {
        switch (node.type) {
            case NodeType.NODE_TYPE_CLASS: {
                const classRange = node.position;

                // Find all methods related to this class
                const methods = this.getRelatedNodes(
                    fileNodes,
                    relationships,
                    node,
                    filePath,
                    {
                        direction: RelatedNodeDirection.FROM,
                        nodeTypeFilter: [NodeType.NODE_TYPE_FUNCTION],
                    },
                );

                // Filter out the constructor method
                const noConstructor = methods.filter(
                    (m) => m.name !== languageConfig.properties.constructorName,
                );

                // Merge the ranges of all methods except the constructor
                const ranges = noConstructor.map((m) => m.position);
                const mergedRanges = this.mergeRanges(ranges);

                // Remove the methods ranges from the class range
                const finalRanges = this.diffRanges(
                    [classRange],
                    mergedRanges,
                    content,
                );

                // Return class range with only the constructor, fields, etc.
                return finalRanges;
            }
            default: {
                return [node.position];
            }
        }
    }

    private mergeRanges(ranges: Range[]): Range[] {
        if (ranges.length < 2) return ranges;

        // Sort ranges by startIndex, then by endIndex
        const sortedRanges = [...ranges].sort(
            (a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex,
        );

        const mergedRanges: Range[] = [];
        let currentRange = { ...sortedRanges[0] };

        for (let i = 1; i < sortedRanges.length; i++) {
            const nextRange = sortedRanges[i];

            // Check if ranges overlap or are contiguous
            if (nextRange.startIndex <= currentRange.endIndex + 1) {
                // Only merge if the next pushes the endIndex further
                if (nextRange.endIndex > currentRange.endIndex) {
                    currentRange.endIndex = nextRange.endIndex;
                    currentRange.endPosition = nextRange.endPosition;
                }
            } else {
                // No overlap, push the current range and start a new one
                mergedRanges.push(currentRange);
                currentRange = { ...nextRange };
            }
        }

        mergedRanges.push(currentRange);

        return mergedRanges;
    }

    private diffRanges(
        ranges: Range[],
        subtract: Range[],
        content: string,
    ): Range[] {
        const result: Range[] = [];

        outer: for (const range of ranges) {
            let pieces: Range[] = [{ ...range }];

            for (const sub of subtract) {
                const nextPieces: Range[] = [];

                for (const p of pieces) {
                    // no overlap
                    if (
                        sub.endIndex < p.startIndex ||
                        sub.startIndex > p.endIndex
                    ) {
                        nextPieces.push(p);
                        continue;
                    }

                    // left piece
                    if (sub.startIndex > p.startIndex) {
                        const leftStart = p.startIndex;
                        const leftEnd = sub.startIndex;

                        nextPieces.push({
                            startIndex: leftStart,
                            endIndex: leftEnd,
                            startPosition: this.indexToPosition(
                                content,
                                leftStart,
                            ),
                            endPosition: this.indexToPosition(content, leftEnd),
                        });
                    }

                    // right piece
                    if (sub.endIndex < p.endIndex) {
                        const rightStart = sub.endIndex;
                        const rightEnd = p.endIndex;

                        nextPieces.push({
                            startIndex: rightStart,
                            endIndex: rightEnd,
                            startPosition: this.indexToPosition(
                                content,
                                rightStart,
                            ),
                            endPosition: this.indexToPosition(
                                content,
                                rightEnd,
                            ),
                        });
                    }
                }

                pieces = nextPieces;
                if (pieces.length === 0) continue outer;
            }

            result.push(...pieces);
        }

        return result;
    }

    /**
     * Given a diff and the content of the new file, it outputs the line ranges
     * for only the lines that were added.
     * @param diff The unified diff string.
     * @param fileContent The content of the file after the changes.
     * @returns An array of Range objects representing the added line ranges.
     */
    private getModifiedRanges(diff: string, fileContent: string): Range[] {
        // The file content of the new file split into lines.
        const fileLines = fileContent.split('\n');
        // The first [0] element is the parsed diff for the first file in the patch.
        const hunks = parsePatch(diff)[0]?.hunks ?? [];

        const modifiedRanges: Range[] = [];

        for (const hunk of hunks) {
            // Keep track of the current line number in the *new* file.
            // Hunk line numbers are 1-based, so we convert to 0-based for array access.
            let currentNewLineNumber = hunk.newStart - 1;

            // Tracks the start line of a contiguous block of added lines.
            // Set to -1 when not in a block.
            let blockStartLine = -1;

            // Pad the hunk lines with a sentinel value to handle blocks at the very end.
            const hunkLines = [...hunk.lines, ''];

            for (const line of hunkLines) {
                const lineIsAddition = line.startsWith('+');
                const lineIsDeletion = line.startsWith('-');

                if (lineIsAddition && blockStartLine === -1) {
                    // Start of a new contiguous block of additions.
                    blockStartLine = currentNewLineNumber;
                } else if (!lineIsAddition && blockStartLine !== -1) {
                    // End of a contiguous block. The block ended on the *previous* line.
                    const blockEndLine = currentNewLineNumber - 1;
                    const range = this.calculateRangeFromLines(
                        blockStartLine,
                        blockEndLine,
                        fileLines,
                    );
                    if (range) {
                        modifiedRanges.push(range);
                    }
                    // Reset for the next block.
                    blockStartLine = -1;
                }

                // Deletions don't exist in the new file, so they don't increment the new line number.
                if (!lineIsDeletion) {
                    currentNewLineNumber++;
                }
            }
        }

        return modifiedRanges;
    }

    /**
     * Helper to calculate a Range object from start and end line numbers.
     * @param startLine 0-based start line index.
     * @param endLine 0-based end line index.
     * @param lines The lines of the file content.
     * @returns A Range object.
     */
    private calculateRangeFromLines(
        startLine: number,
        endLine: number,
        lines: string[],
    ): Range | undefined {
        if (startLine > endLine || startLine < 0 || endLine >= lines.length) {
            return undefined;
        }

        let startIndex = 0;
        for (let i = 0; i < startLine; i++) {
            startIndex += lines[i].length + 1; // +1 for the newline character
        }

        let endIndex = startIndex;
        for (let i = startLine; i <= endLine; i++) {
            // Add line length. Add newline character except for the very last line of the file.
            endIndex += lines[i].length + (i < lines.length - 1 ? 1 : 0);
        }

        const startPosition: Point = {
            row: startLine,
            column: 0,
        };

        const endPosition: Point = {
            row: endLine,
            column: lines[endLine].length,
        };

        return {
            startIndex,
            endIndex,
            startPosition,
            endPosition,
        };
    }

    analyzeDiff(
        prContent: {
            diff: string;
            headCodeGraphFunctions: Map<string, FunctionAnalysis>;
            prFilePath: string;
        },
        baseContent: {
            baseCodeGraphFunctions: Map<string, FunctionAnalysis>;
            baseFilePath: string;
        },
    ): ChangeResult {
        const result: ChangeResult = {
            added: [],
            modified: [],
            deleted: [],
        };

        try {
            // Extract functions from the file in both graphs
            const prFunctions = this.extractFileFunctions(
                prContent.headCodeGraphFunctions,
                prContent.prFilePath,
            );
            const baseFunctions = this.extractFileFunctions(
                baseContent.baseCodeGraphFunctions,
                baseContent.baseFilePath,
            );

            const prFunctionMap = new Map(prFunctions.map((f) => [f.name, f]));
            const baseFunctionMap = new Map(
                baseFunctions.map((f) => [f.name, f]),
            );

            for (const [name, func] of prFunctionMap) {
                if (!baseFunctionMap.has(name)) {
                    result.added.push({
                        name: func.name,
                        fullName: `${func.className}.${func.name}`,
                        functionHash: func.functionHash,
                        signatureHash: func.signatureHash,
                        id: func.nodeId,
                        fullText: func.fullText,
                        lines: func.lines,
                    });
                }
            }
            for (const [name, func] of baseFunctionMap) {
                if (!prFunctionMap.has(name)) {
                    result.deleted.push({
                        name,
                        fullName: `${func.className}.${func.name}`,
                        functionHash: func.functionHash,
                        signatureHash: func.signatureHash,
                        id: func.nodeId,
                        fullText: func.fullText,
                        lines: func.lines,
                    });
                }
            }

            const hunks = this.parseHunks(prContent.diff);
            for (const hunk of hunks) {
                for (const func of prFunctions) {
                    const fullName = `${func.className}.${func.name}`;
                    if (
                        this.isHunkAffectingFunction(hunk, func) &&
                        !result.added.some(
                            (item) => item.fullName === fullName,
                        ) &&
                        !result.deleted.some(
                            (item) => item.fullName === fullName,
                        ) &&
                        !result.modified.some(
                            (item) => item.fullName === fullName,
                        )
                    ) {
                        result.modified.push({
                            name: func.name,
                            fullName,
                            functionHash: func.functionHash,
                            signatureHash: func.signatureHash,
                            id: func.nodeId,
                            fullText: func.fullText,
                            lines: func.lines,
                        });
                    }
                }
            }

            return result;
        } catch (error) {
            console.error('Error analyzing diff:', error);
            return result;
        }
    }

    private extractFileFunctions(
        codeGraphFunctions: Map<string, FunctionAnalysis>,
        filePath: string,
    ): FunctionAnalysis[] {
        if (!codeGraphFunctions) {
            return [];
        }

        const normalizedPath = path.normalize(filePath);

        const funcs = Array.from(codeGraphFunctions.entries())
            .filter(([, func]) =>
                this.isMatchingFile(func.file, normalizedPath),
            )
            .map(([key, func]) => ({
                ...func,
                name: key.split(':').pop() || 'unknown',
                startLine: func.startLine || 0,
                endLine: func.endLine || 0,
            }));

        return funcs;
    }

    /**
     * Checks if two file paths match
     */
    private isMatchingFile(file1: string, file2: string): boolean {
        // Normalize paths for comparison
        const norm1 = path.normalize(file1);
        const norm2 = path.normalize(file2);

        // Compare the normalized paths exactly
        return norm1 === norm2;
    }

    private parseHunks(diff: string): DiffHunk[] {
        const hunks: DiffHunk[] = [];
        const hunkRegex = /@@ -(\d+),(\d+) \+(\d+),(\d+) @@([\s\S]+?)(?=@@|$)/g;

        let match: string[];
        while ((match = hunkRegex.exec(diff)) !== null) {
            hunks.push({
                oldStart: parseInt(match[1], 10),
                oldCount: parseInt(match[2], 10),
                newStart: parseInt(match[3], 10),
                newCount: parseInt(match[4], 10),
                content: match[5].trim(),
            });
        }

        return hunks;
    }

    /**
     * Checks if a hunk affects a function
     */
    private isHunkAffectingFunction(
        hunk: DiffHunk,
        func: ExtendedFunctionInfo,
    ): boolean {
        const hunkStartLine = hunk.oldStart;
        const hunkEndLine = hunk.oldStart + hunk.oldCount - 1;

        // Check if there is overlap between the hunk and the function
        const isOverlapping =
            // Hunk starts within the function
            (hunkStartLine >= func.startLine &&
                hunkStartLine <= func.endLine) ||
            // Hunk ends within the function
            (hunkEndLine >= func.startLine && hunkEndLine <= func.endLine) ||
            // Hunk completely encompasses the function
            (hunkStartLine <= func.startLine && hunkEndLine >= func.endLine);

        // Check if the hunk has real additions or deletions (not just context)
        const hasRealChanges = hunk.content
            .split('\n')
            .some((line) => line.startsWith('+') || line.startsWith('-'));

        return isOverlapping && hasRealChanges;
    }

    private getFileNodes(
        graphs: GetGraphsResponseData,
        filePath: string,
    ): EnrichedGraphNode[] {
        if (!graphs || !graphs.enrichHeadGraph) {
            this.logger.warn({
                context: DiffAnalyzerService.name,
                message: `Graphs not provided or invalid`,
                metadata: { filePath },
                serviceName: DiffAnalyzerService.name,
            });
            return [];
        }

        return graphs.enrichHeadGraph.nodes.filter((node) =>
            node.filePath.includes(filePath),
        );
    }

    private getNodesForRanges(
        fileNodes: EnrichedGraphNode[],
        ranges: Range[],
    ): EnrichedGraphNode[] {
        const result: EnrichedGraphNode[] = [];

        for (const range of ranges) {
            // Find all nodes that fully contain the range
            const containingNodes = fileNodes.filter((def) => {
                return (
                    def.position.startIndex <= range.startIndex &&
                    def.position.endIndex >= range.endIndex
                );
            });

            if (containingNodes.length === 0) continue;

            // Pick the smallest node (by range size)
            const smallestNode = containingNodes.reduce((min, curr) => {
                const minSize = min.position.endIndex - min.position.startIndex;
                const currSize =
                    curr.position.endIndex - curr.position.startIndex;
                return currSize < minSize ? curr : min;
            });

            result.push(smallestNode);
        }

        return result;
    }

    private static readonly nodeTypeRelationships: Partial<
        Record<NodeType, RelationshipType[]>
    > = {
        [NodeType.NODE_TYPE_FUNCTION]: [
            RelationshipType.RELATIONSHIP_TYPE_CALLS,
            RelationshipType.RELATIONSHIP_TYPE_HAS_METHOD,
        ],
        [NodeType.NODE_TYPE_CLASS]: [
            RelationshipType.RELATIONSHIP_TYPE_HAS_METHOD,
            RelationshipType.RELATIONSHIP_TYPE_EXTENDS,
            RelationshipType.RELATIONSHIP_TYPE_IMPLEMENTS,
            RelationshipType.RELATIONSHIP_TYPE_IMPLEMENTED_BY,
            RelationshipType.RELATIONSHIP_TYPE_EXTENDED_BY,
        ],
    };

    private getRelatedNodes(
        fileNodes: EnrichedGraphNode[],
        relations: EnrichedGraphEdge[],
        node: EnrichedGraphNode,
        filePath: string,
        options?: {
            direction?: RelatedNodeDirection;
            nodeTypeFilter?: NodeType[];
        },
    ): EnrichedGraphNode[] {
        if (!fileNodes || !relations || !node) {
            this.logger.warn({
                context: DiffAnalyzerService.name,
                message: `Invalid input for getting related nodes`,
                metadata: { fileNodes, relations, node },
                serviceName: DiffAnalyzerService.name,
            });
            return [];
        }

        const { direction = RelatedNodeDirection.TO, nodeTypeFilter = [] } =
            options ?? {};

        const relatedNodes = relations
            .filter((relation) => {
                // filter relations based on direction and type
                const isToRelation =
                    direction === RelatedNodeDirection.TO &&
                    relation.to === node.id;

                const isFromRelation =
                    direction === RelatedNodeDirection.FROM &&
                    relation.from === node.id;

                const isValidRelationType =
                    DiffAnalyzerService.nodeTypeRelationships[
                        node.type
                    ]?.includes(relation.type);

                return (isToRelation || isFromRelation) && isValidRelationType;
            })
            .map((relation) => {
                // map the relations to the related nodes
                const relatedNodeId =
                    direction === RelatedNodeDirection.TO
                        ? relation.from
                        : relation.to;

                // find the related node in the file nodes
                const relatedNode = fileNodes.find(
                    (n) => n.id === relatedNodeId,
                );

                return relatedNode || null;
            })
            .filter((n) => {
                // filter out null nodes and apply node type filter
                if (!n) return false;
                if (nodeTypeFilter.length === 0) return true;
                return nodeTypeFilter.includes(n.type);
            });

        const otherFileFunctions = relatedNodes.filter(
            (n) =>
                n.filePath !== filePath &&
                n.type === NodeType.NODE_TYPE_FUNCTION,
        );

        const otherFileFunctionsClass = relations
            .filter((relation) => {
                // filter relations that connect functions to classes in other files
                return (
                    relation.type ===
                        RelationshipType.RELATIONSHIP_TYPE_HAS_METHOD &&
                    otherFileFunctions.some((f) => f.id === relation.to)
                );
            })
            .map((relation) => {
                // find the class node in the file nodes
                const classNode = fileNodes.find(
                    (n) =>
                        n.id === relation.from &&
                        n.type === NodeType.NODE_TYPE_CLASS,
                );

                return classNode || null;
            })
            .filter((n) => n !== null);

        // Combine related nodes from the same file and classes from other files
        relatedNodes.push(...otherFileFunctionsClass);

        return relatedNodes;
    }

    private indexToPosition(content: string, index: number): Point {
        // Split everything up to `index` into lines
        const lines = content.slice(0, index).split('\n');
        const row = lines.length - 1;
        const column = lines[lines.length - 1].length;
        return { row, column };
    }
}
