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
        try {
            const { files } = request;

            await taskContext.start('Analyzing files from diff');

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

            let graphs: GetGraphsResponseData | null = null;

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
            } catch (error) {
                this.logError(
                    'Failed to build shared graph for diff analysis, falling back to simple diff strategy',
                    error as Error,
                    {
                        taskId: taskContext.taskId,
                        filesCount: preparedFiles.length,
                    },
                );
            }

            const promisesResult = await Promise.allSettled(
                preparedFiles.map((file) =>
                    this.analyzePreparedFile(file, taskContext.taskId, graphs),
                ),
            );

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

            await taskContext.complete('Analyzed all files', {
                files: result,
            });
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
        const {
            id,
            originalEncryptedContent,
            filePath,
            diff,
            fullContent,
            languageHintPath,
        } = file;

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
                    return {
                        id,
                        content: await this.compressAndEncrypt(relevantContent),
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
        }

        try {
            const simpleContent = this.analyzeSimpleFile(fullContent, diff);

            if (simpleContent.trim().length > 0) {
                return {
                    id,
                    content: await this.compressAndEncrypt(simpleContent),
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

    private logError(message: string, error: Error, metadata?: any): void {
        this.logger.error({
            message,
            context: InitializeContentFromDiffUseCase.name,
            error,
            metadata,
        });
    }
}
