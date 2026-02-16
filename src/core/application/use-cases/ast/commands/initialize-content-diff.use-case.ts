import { TaskContext } from '@/core/domain/task/contracts/task-manager.contract.js';
import { DiffAnalyzerService } from '@/core/infrastructure/adapters/services/diff/diff-analyzer.service.js';
import { GraphEnrichmentService } from '@/core/infrastructure/adapters/services/enrichment/graph-enrichment.service.js';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/parsing/code-knowledge-graph.service.js';
import {
    FileContentFlag,
    GetContentFromDiffResponse,
    GetGraphsResponseData,
    InitializeContentFromDiffRequest,
} from '@/shared/types/ast.js';
import { decrypt } from '@/shared/utils/crypto.js';
import { Injectable } from '@nestjs/common';
import { parsePatch } from 'diff';

@Injectable()
export class InitializeContentFromDiffUseCase {
    constructor(
        private readonly differService: DiffAnalyzerService,
        private readonly codeKnowledgeGraphService: CodeKnowledgeGraphService,
        private readonly graphEnrichmentService: GraphEnrichmentService,
        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        taskContext: TaskContext,
        request: InitializeContentFromDiffRequest,
    ): Promise<void> {
        try {
            const { files } = request;

            await taskContext.start('Analyzing files from diff');

            const promises = files.map((file) =>
                this.analyzeFile(file, taskContext.taskId),
            );
            const promisesResult = await Promise.allSettled(promises);

            const result = promisesResult
                .map((result, index) => {
                    const metadata = {
                        taskId: taskContext.taskId,
                        filePath: files[index].filePath,
                        fileId: files[index].id,
                    };

                    if (result.status === 'fulfilled') {
                        this.log(
                            `Successfully analyzed file: ${files[index].filePath}`,
                            metadata,
                        );

                        return result.value;
                    } else {
                        this.logError(
                            `Failed to analyze file: ${files[index].filePath}. Error: ${result.reason}`,
                            result.reason,
                            metadata,
                        );

                        return null;
                    }
                })
                .filter((res) => res !== null);

            await taskContext.complete('Analyzed all files', result);
        } catch (error) {
            this.logError(
                'Failed to initialize content from diff',
                error as Error,
                {
                    taskId: taskContext.taskId,
                },
            );

            await taskContext.fail('Failed to initialize content from diff');
        }
    }

    private async analyzeFile(
        file: InitializeContentFromDiffRequest['files'][number],
        taskId: string,
    ): Promise<GetContentFromDiffResponse['files'][number]> {
        const { id, content: encryptedContent, filePath, diff } = file;
        const content = decrypt(encryptedContent);

        try {
            const relevantContent = await this.analyzeDiffFile(
                filePath,
                content,
                diff,
                taskId,
            );

            if (relevantContent.trim().length > 0) {
                return {
                    id,
                    content: relevantContent,
                    flag: FileContentFlag.DIFF,
                };
            }
        } catch (error) {
            this.logError(
                `AST diff analysis failed for file: ${filePath}`,
                error as Error,
                {
                    filePath,
                    fileId: id,
                },
            );
        }

        try {
            const simpleContent = this.analyzeSimpleFile(content, diff);

            if (simpleContent.trim().length > 0) {
                return {
                    id,
                    content: simpleContent,
                    flag: FileContentFlag.SIMPLE,
                };
            }
        } catch (error) {
            this.logError(
                `Simple diff analysis failed for file: ${filePath}`,
                error as Error,
                {
                    filePath,
                    fileId: id,
                },
            );
        }

        return {
            id,
            content,
            flag: FileContentFlag.FULL,
        };
    }

    private async analyzeDiffFile(
        filePath: string,
        content: string,
        diff: string,
        taskId: string,
    ): Promise<string> {
        const graph = await this.codeKnowledgeGraphService.buildGraphStreaming([
            {
                id: filePath,
                content,
                filePath,
            },
        ]);

        const enrichedGraph = this.graphEnrichmentService.enrichGraph(graph);

        const graphs: GetGraphsResponseData = {
            baseGraph: { graph, dir: '/' },
            headGraph: { graph, dir: '/' },
            enrichHeadGraph: enrichedGraph,
        };

        return this.differService.getRelevantContent(
            filePath,
            diff,
            graphs,
            taskId,
            content,
        );
    }

    private analyzeSimpleFile(content: string, diff: string): string {
        const parsedDiff = parsePatch(diff);

        if (parsedDiff.length === 0) {
            throw new Error('No valid diff found in the provided content');
        }

        const fileDiff = parsedDiff[0];

        const hunks = fileDiff.hunks ?? [];
        if (!Array.isArray(hunks) || hunks.length === 0) {
            throw new Error('No hunks found in the parsed diff');
        }

        const fileLines = content.split(/\r?\n/);

        const ranges: Array<{ start: number; end: number }> = [];

        for (const hunk of hunks) {
            const newStart: number =
                typeof hunk.newStart === 'number' && hunk.newStart > 0
                    ? hunk.newStart
                    : (hunk.oldStart ?? 1);
            const newLines: number =
                typeof hunk.newLines === 'number' && hunk.newLines >= 0
                    ? hunk.newLines
                    : (hunk.oldLines ?? 0);

            const centerIndex = Math.max(0, newStart - 1);
            const start = Math.max(0, centerIndex - 5);
            const end = Math.min(
                fileLines.length,
                centerIndex + Math.max(1, newLines) + 5,
            );

            ranges.push({ start, end });
        }

        ranges.sort((a, b) => a.start - b.start);
        const merged: Array<{ start: number; end: number }> = [];

        for (const r of ranges) {
            if (merged.length === 0) {
                merged.push({ ...r });
                continue;
            }

            const last = merged[merged.length - 1];
            if (r.start <= last.end + 1) {
                last.end = Math.max(last.end, r.end);
            } else {
                merged.push({ ...r });
            }
        }

        const snippets = merged.map((r) =>
            fileLines.slice(r.start, r.end).join('\n'),
        );

        return snippets.join('\n\n');
    }

    private log(message: string, metadata?: any): void {
        this.logger.log({
            message,
            context: InitializeContentFromDiffUseCase.name,
            metadata,
        });
    }

    private logError(message: string, error: Error, metadata?: any): void {
        this.logger.error({
            message,
            context: InitializeContentFromDiffUseCase.name,
            error,
            metadata,
        });
    }
}
