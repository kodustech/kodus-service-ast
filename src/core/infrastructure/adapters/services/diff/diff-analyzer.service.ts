import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service';
import {
    EnrichedGraphNode,
    FunctionAnalysis,
    GetGraphsResponseData,
    NodeType,
    Point,
    Range,
    RelationshipType,
} from '@kodus/kodus-proto/v2';
import { handleError } from '@/shared/utils/errors';
import {
    ChangeResult,
    DiffHunk,
    ExtendedFunctionInfo,
} from '@/core/domain/diff/types/diff-analyzer.types';
import * as path from 'path';

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

            const fileDefinitions = graphs.enrichHeadGraph.nodes.filter(
                (node) => node.filePath.includes(filePath),
            );

            if (fileDefinitions.length === 0) {
                this.logger.warn({
                    context: DiffAnalyzerService.name,
                    message: `No file definitions found for ${filePath}`,
                    metadata: { diff, content, graphs },
                    serviceName: DiffAnalyzerService.name,
                });
                return null;
            }

            const inRangeDefinitions = fileDefinitions.filter((def) => {
                return ranges.some((range) => {
                    return (
                        def.position.startIndex <= range.startIndex &&
                        def.position.endIndex >= range.endIndex
                    );
                });
            });

            if (inRangeDefinitions.length === 0) {
                this.logger.warn({
                    context: DiffAnalyzerService.name,
                    message: `No definitions in range found for ${filePath}`,
                    metadata: { diff, content, graphs },
                    serviceName: DiffAnalyzerService.name,
                });
                return null;
            }

            const closestNode = inRangeDefinitions.reduce(
                (smallest, current) => {
                    const currentRange = {
                        startIndex: current.position.startIndex,
                        endIndex: current.position.endIndex,
                    };
                    const smallestRange = {
                        startIndex: smallest.position.startIndex,
                        endIndex: smallest.position.endIndex,
                    };
                    return currentRange.endIndex - currentRange.startIndex <
                        smallestRange.endIndex - smallestRange.startIndex
                        ? current
                        : smallest;
                },
                inRangeDefinitions[0],
            );

            const relations = graphs.enrichHeadGraph.relationships.filter(
                (relation) =>
                    relation.to === closestNode.id &&
                    (relation.type ===
                        RelationshipType.RELATIONSHIP_TYPE_CALLS ||
                        relation.type ===
                            RelationshipType.RELATIONSHIP_TYPE_HAS_METHOD),
            );
            const relatedNodes = relations.map(
                (relation) =>
                    graphs.enrichHeadGraph.nodes.find(
                        (node) => node.id === relation.from,
                    ) || null,
            );

            const classNode = relatedNodes.find(
                (node) => node?.type === NodeType.NODE_TYPE_CLASS,
            );

            const callers = relatedNodes.filter(
                (node) => node?.type === NodeType.NODE_TYPE_FUNCTION,
            );

            const classMethodRelations =
                graphs.enrichHeadGraph.relationships.filter(
                    (relation) =>
                        relation.from === classNode?.id &&
                        relation.to !== closestNode.id &&
                        relation.type ===
                            RelationshipType.RELATIONSHIP_TYPE_HAS_METHOD,
                );

            const classMethods = classMethodRelations.map((relation) => {
                return (
                    graphs.enrichHeadGraph.nodes.find(
                        (node) => node.id === relation.to,
                    ) || null
                );
            });

            const rangesToInclude = this.getRanges(
                closestNode,
                classNode,
                classMethods,
                callers,
            );

            return this.contentFromRanges(content, rangesToInclude);
        } catch (error) {
            this.logger.error({
                context: DiffAnalyzerService.name,
                message: `Failed to get relevant content`,
                error: handleError(error),
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

    private getRanges(
        target: EnrichedGraphNode,
        classNode: EnrichedGraphNode,
        classMethods: EnrichedGraphNode[],
        callers: EnrichedGraphNode[],
    ): Range[] {
        // 1. Get class range (unchanged)
        const classRange = classNode.position;

        // 2. Carve out non-caller methods *inside* class, but keep outer class intact
        const nonCallerMethods = classMethods.filter(
            (method) =>
                method.name !== 'constructor' &&
                !callers.some((caller) => caller.name === method.name),
        );

        // 3. Remove only the method ranges, not the whole class body
        let resultRanges: Range[] = [classRange];
        for (const method of nonCallerMethods) {
            resultRanges = this.diffRange(resultRanges, method.position);
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

    private getFilename(diff: string): string {
        const match = diff.match(/diff --git a\/(.*?) b\//);
        if (match && match[1]) {
            return match[1];
        }
        throw new Error('Filename not found in diff');
    }

    private getModifiedRanges(diff: string, fileContent: string): Range[] {
        const ranges: Range[] = [];
        const fileLines = fileContent.split('\n');

        // Precompute line start indices for mapping row/column to absolute index
        const lineStartIndices = fileLines.reduce<number[]>(
            (acc, line, idx) => {
                if (idx === 0) acc.push(0);
                else acc.push(acc[idx - 1] + line.length + 1);
                return acc;
            },
            [],
        );

        // Helper: given absolute index, find row/column
        const indexToPos = (index: number): Point => {
            // binary search over lineStartIndices
            let low = 0;
            let high = lineStartIndices.length - 1;
            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                const start = lineStartIndices[mid];
                const nextStart =
                    mid + 1 < lineStartIndices.length
                        ? lineStartIndices[mid + 1]
                        : Infinity;
                if (index < start) {
                    high = mid - 1;
                } else if (index >= nextStart) {
                    low = mid + 1;
                } else {
                    return { row: mid, column: index - start };
                }
            }
            return { row: 0, column: index };
        };

        const diffLines = diff.split('\n');
        let lastSearchIndex = 0;
        for (let i = 0; i < diffLines.length; i++) {
            const header = diffLines[i].match(/^@@.*\+(\d+)(?:,(\d+))? @@/);
            if (!header) continue;
            i++;
            while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
                const line = diffLines[i];
                if (line.startsWith('+')) {
                    const text = line.slice(1);
                    // Find the added text in the fileContent starting from lastSearchIndex
                    const startIndex = fileContent.indexOf(
                        text,
                        lastSearchIndex,
                    );
                    if (startIndex !== -1) {
                        const endIndex = startIndex + text.length;
                        const startPos = indexToPos(startIndex - 1);
                        const endPos = indexToPos(endIndex - 1);
                        ranges.push({
                            startIndex: startIndex - 1,
                            endIndex: endIndex - 1,
                            startPosition: startPos,
                            endPosition: endPos,
                        });
                        lastSearchIndex = endIndex;
                    }
                }
                i++;
            }
        }
        return ranges;
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
}
