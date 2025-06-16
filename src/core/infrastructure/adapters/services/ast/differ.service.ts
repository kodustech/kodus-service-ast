import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service';
import {
    EnrichedGraphNode,
    GetGraphsResponseData,
    NodeType,
    Point,
    Range,
    RelationshipType,
} from '@kodus/kodus-proto/v2';
import { handleError } from '@/shared/utils/errors';

@Injectable()
export class DifferService {
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
                    context: DifferService.name,
                    message: `Content or graphs not provided`,
                    metadata: { diff, content, graphs },
                    serviceName: DifferService.name,
                });
                return null;
            }

            const ranges = this.getModifiedRanges(diff, content);
            if (ranges.length === 0) {
                this.logger.warn({
                    context: DifferService.name,
                    message: `No relevant ranges found in diff`,
                    metadata: { diff, content, graphs },
                    serviceName: DifferService.name,
                });
                return null;
            }

            const fileDefinitions = graphs.enrichHeadGraph.nodes.filter(
                (node) => node.filePath.includes(filePath),
            );

            if (fileDefinitions.length === 0) {
                this.logger.warn({
                    context: DifferService.name,
                    message: `No file definitions found for ${filePath}`,
                    metadata: { diff, content, graphs },
                    serviceName: DifferService.name,
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
                    context: DifferService.name,
                    message: `No definitions in range found for ${filePath}`,
                    metadata: { diff, content, graphs },
                    serviceName: DifferService.name,
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
                context: DifferService.name,
                message: `Failed to get relevant content`,
                error: handleError(error),
                metadata: {
                    diff,
                    content,
                    graphs: JSON.stringify(graphs).slice(0, 100),
                },
                serviceName: DifferService.name,
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
}
