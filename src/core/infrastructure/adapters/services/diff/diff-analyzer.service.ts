import { Injectable } from '@nestjs/common';
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
} from '@kodus/kodus-proto/ast/v2';
import {
    ChangeResult,
    DiffHunk,
    ExtendedFunctionInfo,
} from '@/core/domain/diff/types/diff-analyzer.types';
import * as path from 'path';
import { parsePatch } from 'diff';
@Injectable()
export class DiffAnalyzerService {
    constructor(private readonly logger: PinoLoggerService) {}

    getRelevantContent(
        filePath: string,
        diff: string,
        content: string,
        graphs: GetGraphsResponseData,
    ): string {
        try {
            if (!content || !graphs) {
                this.logger.warn({
                    context: DiffAnalyzerService.name,
                    message: `Content or graphs not provided`,
                    metadata: { diff, content, graphs },
                    serviceName: DiffAnalyzerService.name,
                });
                return null;
            }

            const ranges = this.getModifiedRanges(diff, content);
            if (ranges.length === 0) {
                this.logger.warn({
                    context: DiffAnalyzerService.name,
                    message: `No relevant ranges found in diff`,
                    metadata: { diff, content, graphs },
                    serviceName: DiffAnalyzerService.name,
                });
                return null;
            }

            const fileNodes = this.getFileNodes(graphs, filePath);
            if (fileNodes.length === 0) {
                this.logger.warn({
                    context: DiffAnalyzerService.name,
                    message: `No file nodes found for ${filePath}`,
                    metadata: { diff, content, graphs, filePath },
                    serviceName: DiffAnalyzerService.name,
                });
                return null;
            }

            const nodes = this.getNodesForRanges(fileNodes, ranges);
            if (nodes.length === 0) {
                this.logger.warn({
                    context: DiffAnalyzerService.name,
                    message: `No nodes found for ranges`,
                    metadata: { diff, content, graphs, filePath },
                    serviceName: DiffAnalyzerService.name,
                });
                return null;
            }

            const nodesValues = Array.from(nodes.values());
            for (const node of nodesValues) {
                const relatedNodes = this.getRelatedNodes(
                    fileNodes,
                    graphs.enrichHeadGraph.relationships,
                    node,
                );

                relatedNodes.forEach((relatedNode) => {
                    nodes.push(relatedNode);
                });
            }

            const finalRanges = this.getRanges(nodes);

            return this.contentFromRanges(content, finalRanges);
        } catch (error) {
            this.logger.error({
                context: DiffAnalyzerService.name,
                message: `Failed to get relevant content`,
                error,
                metadata: {
                    diff: diff.slice(0, 100),
                    content: content.slice(0, 100),
                    graphs: JSON.stringify(graphs).slice(0, 100),
                },
                serviceName: DiffAnalyzerService.name,
            });
            return null;
        }
    }

    private contentFromRanges(content: string, ranges: Range[]): string {
        const sorted = [...ranges].sort((a, b) => a.startIndex - b.startIndex);

        const slices = sorted.map((r) =>
            content.trim().substring(r.startIndex, r.endIndex),
        );

        const trimmedSlices = slices.map((slice) =>
            slice.replace(/^\s*\n|\n\s*$/g, ''),
        );

        return trimmedSlices.join('\n\n');
    }

    private getRanges(nodes: EnrichedGraphNode[]): Range[] {
        const resultRanges = Array.from(
            new Map(nodes.map((node) => [node.id, node.position])).values(),
        );

        if (resultRanges.length < 2) return resultRanges;

        const sortedRanges = resultRanges.sort(
            (a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex,
        );

        const mergedRanges: Range[] = [];
        let currentRange = sortedRanges[0];

        for (let i = 1; i < sortedRanges.length; i++) {
            const nextRange = sortedRanges[i];

            // Check if ranges overlap or are contiguous
            if (nextRange.startIndex <= currentRange.endIndex + 1) {
                // Merge ranges
                currentRange.endIndex = nextRange.endIndex;
                currentRange.endPosition = nextRange.endPosition;
            } else {
                // No overlap, push the current range and start a new one
                mergedRanges.push(currentRange);
                currentRange = nextRange;
            }
        }

        return resultRanges;
    }

    private diffRange(ranges: Range[], subtract: Range): Range[] {
        const result: Range[] = [];

        for (const range of ranges) {
            // No overlap
            if (
                subtract.endIndex <= range.startIndex ||
                subtract.startIndex >= range.endIndex
            ) {
                result.push(range);
                continue;
            }

            // Left piece
            if (subtract.startIndex > range.startIndex) {
                result.push({
                    startIndex: range.startIndex,
                    endIndex: subtract.startIndex - 1,
                    startPosition: range.startPosition,
                    endPosition: subtract.startPosition,
                });
            }

            // Right piece
            if (subtract.endIndex < range.endIndex) {
                result.push({
                    startIndex: subtract.endIndex + 1,
                    endIndex: range.endIndex,
                    startPosition: subtract.endPosition,
                    endPosition: range.endPosition,
                });
            }
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
        const nodesInRange = fileNodes.filter((def) => {
            return ranges.some((range) => {
                return (
                    def.position.startIndex <= range.startIndex &&
                    def.position.endIndex >= range.endIndex
                );
            });
        });

        return nodesInRange;
    }

    private getClosestNodeForRange(
        nodes: EnrichedGraphNode[],
        range: Range,
    ): EnrichedGraphNode | null {
        if (nodes.length === 0 || !range) {
            this.logger.warn({
                context: DiffAnalyzerService.name,
                message: `No nodes or range provided`,
                metadata: { nodes, range },
                serviceName: DiffAnalyzerService.name,
            });
            return null;
        }

        const overlappingNodes = nodes.filter((node) => {
            const nodeStart = node.position.startIndex;
            const nodeEnd = node.position.endIndex;

            return nodeEnd >= range.startIndex && nodeStart <= range.endIndex;
        });

        if (overlappingNodes.length === 0) {
            return null;
        }

        const closestNode = overlappingNodes.reduce((min, curr) => {
            const minSize = min.position.endIndex - min.position.startIndex;
            const currSize = curr.position.endIndex - curr.position.startIndex;

            return currSize < minSize ? curr : min;
        }, overlappingNodes[0]);
        return closestNode;
    }

    private readonly nodeTypeRelationships: Partial<
        Record<NodeType, RelationshipType[]>
    > = {
        [NodeType.NODE_TYPE_FUNCTION]: [
            RelationshipType.RELATIONSHIP_TYPE_CALLS,
            RelationshipType.RELATIONSHIP_TYPE_HAS_METHOD,
        ],
    };

    private getRelatedNodes(
        fileNodes: EnrichedGraphNode[],
        relations: EnrichedGraphEdge[],
        node: EnrichedGraphNode,
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

        const relatedNodes = relations
            .filter(
                (relation) =>
                    relation.to === node.id &&
                    this.nodeTypeRelationships[node.type]?.includes(
                        relation.type,
                    ),
            )
            .map(
                (relation) =>
                    fileNodes.find((n) => n.id === relation.from) || null,
            )
            .filter((n) => n !== null);

        return relatedNodes;
    }
}
