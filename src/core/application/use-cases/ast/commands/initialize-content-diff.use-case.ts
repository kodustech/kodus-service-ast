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
import {
    compressString,
    decompressString,
} from '@/shared/utils/compression.js';
import { decrypt, encrypt } from '@/shared/utils/crypto.js';
import { Inject, Injectable } from '@nestjs/common';
import { parsePatch } from 'diff';
import { extname } from 'node:path';

@Injectable()
export class InitializeContentFromDiffUseCase {
    constructor(
        @Inject(DiffAnalyzerService)
        private readonly differService: DiffAnalyzerService,
        @Inject(CodeKnowledgeGraphService)
        private readonly codeKnowledgeGraphService: CodeKnowledgeGraphService,
        @Inject(GraphEnrichmentService)
        private readonly graphEnrichmentService: GraphEnrichmentService,
        @Inject(PinoLoggerService)
        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        taskContext: TaskContext,
        request: InitializeContentFromDiffRequest,
    ): Promise<void> {
        const executionStart = performance.now();

        try {
            const { files } = request;
            const taskMetadata = {
                taskId: taskContext.taskId,
                filesCount: files.length,
            };

            this.log('Starting content initialization from diff', taskMetadata);

            await taskContext.start('Analyzing files from diff');

            const preparationStart = performance.now();

            const preparedFiles = await Promise.all(
                files.map(async (file) => {
                    const fullContent = (
                        await this.decryptAndDecompress(file.content)
                    ).trim();
                    const diff = await this.decryptAndDecompress(file.diff);

                    return {
                        id: file.id,
                        originalEncryptedContent: file.content,
                        filePath: file.filePath,
                        diff,
                        fullContent,
                        languageHintPath: this.buildLanguageHintPath(
                            file.id,
                            file.filePath,
                        ),
                    };
                }),
            );

            const preparationDurationMs = Math.round(
                performance.now() - preparationStart,
            );

            this.log('Prepared files for analysis', {
                ...taskMetadata,
                durationMs: preparationDurationMs,
                totalContentChars: preparedFiles.reduce(
                    (total, file) => total + file.fullContent.length,
                    0,
                ),
                totalDiffChars: preparedFiles.reduce(
                    (total, file) => total + file.diff.length,
                    0,
                ),
            });

            let graphs: GetGraphsResponseData | null = null;

            const graphBuildStart = performance.now();

            try {
                const filesToAnalyze = preparedFiles.map((file) => ({
                    id: file.id,
                    content: file.fullContent,
                    filePath: file.languageHintPath,
                }));

                const graph =
                    await this.codeKnowledgeGraphService.buildGraphStreaming(
                        filesToAnalyze,
                    );

                const enrichedGraph =
                    this.graphEnrichmentService.enrichGraph(graph);

                graphs = {
                    graph,
                    enrichedGraph,
                };

                this.log('Built shared graph for diff analysis', {
                    ...taskMetadata,
                    durationMs: Math.round(performance.now() - graphBuildStart),
                    graphFilesCount: graph.files.size,
                    graphFunctionsCount: graph.functions.size,
                    graphTypesCount: graph.types.size,
                    enrichedNodesCount: enrichedGraph.nodes.length,
                    enrichedRelationshipsCount:
                        enrichedGraph.relationships.length,
                });
            } catch (error) {
                this.logError(
                    'Failed to build shared graph for diff analysis, falling back to simple diff strategy',
                    error as Error,
                    {
                        ...taskMetadata,
                        durationMs: Math.round(
                            performance.now() - graphBuildStart,
                        ),
                    },
                );
            }

            const perFileAnalysisStart = performance.now();

            this.log('Starting per-file content extraction', {
                ...taskMetadata,
                graphEnabled: Boolean(graphs),
            });

            const promisesResult = await Promise.allSettled(
                preparedFiles.map((file) =>
                    this.analyzePreparedFile(file, taskContext.taskId, graphs),
                ),
            );

            const rejectedCount = promisesResult.filter(
                (analysisResult) => analysisResult.status === 'rejected',
            ).length;

            const result = promisesResult
                .map<GetContentFromDiffResponse['files'][number] | null>(
                    (analysisResult, index) => {
                        const file = preparedFiles[index];
                        const metadata = {
                            taskId: taskContext.taskId,
                            filePath: file.filePath,
                            fileId: file.id,
                        };

                        if (analysisResult.status === 'fulfilled') {
                            this.log(
                                `Successfully analyzed file: ${file.filePath}`,
                                metadata,
                            );

                            return analysisResult.value;
                        }

                        this.logError(
                            `Failed to analyze file: ${file.filePath}. Error: ${analysisResult.reason}`,
                            analysisResult.reason,
                            metadata,
                        );

                        return null;
                    },
                )
                .filter(
                    (res): res is GetContentFromDiffResponse['files'][number] =>
                        res !== null,
                );

            const byFlag = result.reduce(
                (acc, fileResult) => {
                    acc[fileResult.flag] = (acc[fileResult.flag] ?? 0) + 1;
                    return acc;
                },
                {} as Record<FileContentFlag, number>,
            );

            this.log('Completed per-file content extraction', {
                ...taskMetadata,
                durationMs: Math.round(
                    performance.now() - perFileAnalysisStart,
                ),
                succeededCount: result.length,
                failedCount: rejectedCount,
                diffCount: byFlag[FileContentFlag.DIFF] ?? 0,
                simpleCount: byFlag[FileContentFlag.SIMPLE] ?? 0,
                fullCount: byFlag[FileContentFlag.FULL] ?? 0,
            });

            await taskContext.complete('Analyzed all files', {
                files: result,
            });

            this.log('Finished content initialization from diff', {
                ...taskMetadata,
                durationMs: Math.round(performance.now() - executionStart),
                completedFilesCount: result.length,
                rejectedCount,
            });
        } catch (error) {
            this.logError(
                'Failed to initialize content from diff',
                error as Error,
                {
                    taskId: taskContext.taskId,
                    durationMs: Math.round(performance.now() - executionStart),
                },
            );

            await taskContext.fail('Failed to initialize content from diff');
        }
    }

    private async decryptAndDecompress(
        encryptedContent: string,
    ): Promise<string> {
        const compressedContent = decrypt(encryptedContent);
        return await decompressString(compressedContent);
    }

    private async compressAndEncrypt(content: string): Promise<string> {
        const compressedContent = await compressString(content);
        return encrypt(compressedContent);
    }

    private async analyzePreparedFile(
        file: {
            id: string;
            originalEncryptedContent: string;
            filePath: string;
            diff: string;
            fullContent: string;
            languageHintPath: string;
        },
        taskId: string,
        graphs: GetGraphsResponseData | null,
    ): Promise<GetContentFromDiffResponse['files'][number]> {
        const fileAnalysisStart = performance.now();

        const {
            id,
            originalEncryptedContent,
            filePath,
            diff,
            fullContent,
            languageHintPath,
        } = file;

        const fileMetadata = {
            taskId,
            fileId: id,
            filePath,
            languageHintPath,
            diffChars: diff.length,
            contentChars: fullContent.length,
        };

        this.log('Starting file analysis', fileMetadata);

        if (graphs) {
            try {
                const relevantContent =
                    await this.differService.getRelevantContent(
                        languageHintPath,
                        diff,
                        graphs,
                        taskId,
                        fullContent,
                    );

                if (relevantContent.trim().length > 0) {
                    this.log('Completed file analysis with AST diff strategy', {
                        ...fileMetadata,
                        durationMs: Math.round(
                            performance.now() - fileAnalysisStart,
                        ),
                        outputChars: relevantContent.length,
                    });

                    return {
                        id,
                        content: await this.compressAndEncrypt(relevantContent),
                        flag: FileContentFlag.DIFF,
                    };
                }

                this.logWarn(
                    'AST diff analysis returned empty content, trying simple diff strategy',
                    fileMetadata,
                );
            } catch (error) {
                this.logError(
                    `AST diff analysis failed for file: ${filePath}`,
                    error as Error,
                    fileMetadata,
                );
            }
        } else {
            this.logWarn(
                'Shared graph unavailable, skipping AST diff analysis and trying simple strategy',
                fileMetadata,
            );
        }

        try {
            const simpleContent = this.analyzeSimpleFile(fullContent, diff);

            if (simpleContent.trim().length > 0) {
                this.log('Completed file analysis with simple diff strategy', {
                    ...fileMetadata,
                    durationMs: Math.round(
                        performance.now() - fileAnalysisStart,
                    ),
                    outputChars: simpleContent.length,
                });

                return {
                    id,
                    content: await this.compressAndEncrypt(simpleContent),
                    flag: FileContentFlag.SIMPLE,
                };
            }

            this.logWarn(
                'Simple diff analysis returned empty content, falling back to full content',
                fileMetadata,
            );
        } catch (error) {
            this.logError(
                `Simple diff analysis failed for file: ${filePath}`,
                error as Error,
                fileMetadata,
            );
        }

        this.logWarn('Returning full file content as fallback', {
            ...fileMetadata,
            durationMs: Math.round(performance.now() - fileAnalysisStart),
        });

        return {
            id,
            content: originalEncryptedContent,
            flag: FileContentFlag.FULL,
        };
    }

    private buildLanguageHintPath(fileId: string, filePath: string): string {
        const extension = extname(filePath || '')
            .trim()
            .toLowerCase();

        if (!extension) {
            return `input/${fileId}.unknown`;
        }

        return `input/${fileId}${extension}`;
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

    private logWarn(message: string, metadata?: any): void {
        this.logger.warn({
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
