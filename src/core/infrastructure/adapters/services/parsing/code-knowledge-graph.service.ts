import { Inject, Injectable } from '@nestjs/common';
import fg from 'fast-glob';
import * as fs from 'fs';
import * as os from 'os';
import {
    CodeGraph,
    FileAnalysis,
    FunctionAnalysis,
    TypeAnalysis,
} from '@/shared/types/ast.js';

import { Piscina } from 'piscina';
import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages.js';
import { PinoLoggerService } from '../logger/pino.service.js';
import { WorkerInput, WorkerOutput } from './worker/worker.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'fs';

interface BatchProgress {
    batch: WorkerOutput;
    progress: number;
    processedFiles: number;
    totalFiles: number;
    batchIndex: number;
    totalBatches: number;
}

interface StreamingMetrics {
    filesProcessed: number;
    averageProcessingTime: number;
    memoryUsage: number;
    startTime: number;
    lastBatchTime: number;
    timeoutCount: number;
    retryCount: number;
    failedBatches: number;
}

@Injectable()
export class CodeKnowledgeGraphService {
    private piscina: Piscina<WorkerInput, WorkerOutput>;
    private streamingMetrics: StreamingMetrics = {
        filesProcessed: 0,
        averageProcessingTime: 0,
        memoryUsage: 0,
        startTime: 0,
        lastBatchTime: 0,
        timeoutCount: 0,
        retryCount: 0,
        failedBatches: 0,
    };

    private readonly memoryThreshold = 0.85;
    private readonly batchPauseMs = 50;
    private readonly adaptivePauseMs = 200;
    private readonly gcThreshold = 0.7;
    private lastGcTime = 0;
    private gcIntervalMs = 10000;

    constructor(
        @Inject(PinoLoggerService) private readonly logger: PinoLoggerService,
    ) {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);

        // If running from src/ (tsx), we need to point to dist/
        // If running from dist/ (node), we're already in the right place
        const isRunningFromSource = __dirname.includes('/src/');

        const workerPath = isRunningFromSource
            ? join(
                  process.cwd(),
                  'dist',
                  'core',
                  'infrastructure',
                  'adapters',
                  'services',
                  'parsing',
                  'worker',
                  'worker.js',
              )
            : join(__dirname, 'worker', 'worker.js');

        if (!existsSync(workerPath)) {
            const error = new Error(
                `Worker file not found at ${workerPath}. Ensure 'yarn build' has been run.`,
            );
            (error as any).errorType = 'SYSTEM_ERROR';
            throw error;
        }

        const cpuCount = os.cpus().length;
        const minThreads = cpuCount - 1;
        const maxThreads = cpuCount - 1;
        const idleTimeout = 30000;
        const maxQueue = 1000;
        const concurrentTasksPerWorker = 2;

        this.piscina = new Piscina({
            filename: workerPath,
            minThreads,
            maxThreads,
            idleTimeout,
            maxQueue,
            concurrentTasksPerWorker,
        });
    }

    public async getAllSourceFiles(baseDir: string): Promise<string[]> {
        const allExtensions = Object.values(SUPPORTED_LANGUAGES)
            .flatMap((lang) => lang.extensions)
            .map((ext) => `**/*${ext}`);

        const ignoreDirs = [
            '**/{node_modules,dist,build,coverage,.git,.vscode}/**',
        ];

        const files = await fg(allExtensions, {
            cwd: baseDir,
            absolute: true,
            ignore: ignoreDirs,
            concurrency: os.cpus().length,
        });

        return files;
    }

    public async *processFilesInBatches(
        files: string[],
        rootDir: string,
    ): AsyncGenerator<BatchProgress> {
        if (files.length === 0) {
            return;
        }

        this.streamingMetrics.startTime = performance.now();
        this.streamingMetrics.lastBatchTime = this.streamingMetrics.startTime;

        const cpuCount = os.cpus().length;
        const batchSize = this.calculateOptimalBatchSize(
            cpuCount,
            files.length,
        );

        const batches = this.chunkArray(files, batchSize);
        const totalFiles = files.length;
        let processedFiles = 0;

        for (let i = 0; i < batches.length; i++) {
            const batchStartTime = performance.now();

            try {
                const batchResult = await this.processBatch(
                    batches[i],
                    rootDir,
                );

                this.clearBatchCache();

                processedFiles += batchResult.files.length;
                const batchTime = performance.now() - batchStartTime;
                this.updateStreamingMetrics(
                    batchTime,
                    batchResult.files.length,
                );

                const progress = (processedFiles / totalFiles) * 100;

                yield {
                    batch: batchResult,
                    progress,
                    processedFiles,
                    totalFiles,
                    batchIndex: i,
                    totalBatches: batches.length,
                };

                if (
                    i % Math.ceil(batches.length / 5) === 0 ||
                    processedFiles % 500 === 0
                ) {
                    this.logger.debug({
                        message: 'Streaming progress update',
                        context: CodeKnowledgeGraphService.name,
                        metadata: {
                            progress: progress.toFixed(1),
                            processedFiles,
                            totalFiles,
                        },
                        serviceName: CodeKnowledgeGraphService.name,
                    });
                }
            } catch (error) {
                this.logger.error({
                    message: 'Error in streaming batch processing',
                    context: CodeKnowledgeGraphService.name,
                    error,
                    metadata: {
                        batchIndex: i,
                        batchFiles: batches[i],
                        processedFiles,
                    },
                    serviceName: CodeKnowledgeGraphService.name,
                });

                yield {
                    batch: {
                        files: [],
                        errors: [
                            `Batch ${i} failed: ${(error as Error).message}`,
                        ],
                    },
                    progress: (processedFiles / totalFiles) * 100,
                    processedFiles,
                    totalFiles,
                    batchIndex: i,
                    totalBatches: batches.length,
                };
            }
        }

        const totalTime = performance.now() - this.streamingMetrics.startTime;
        this.logger.log({
            message: 'Streaming file processing completed',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                totalFiles,
                totalTime: totalTime.toFixed(2),
                averageProcessingTime:
                    this.streamingMetrics.averageProcessingTime.toFixed(2),
                filesPerSecond: (totalFiles / (totalTime / 1000)).toFixed(2),
                peakMemoryUsage: this.streamingMetrics.memoryUsage.toFixed(2),
                timeoutCount: this.streamingMetrics.timeoutCount,
                retryCount: this.streamingMetrics.retryCount,
                failedBatches: this.streamingMetrics.failedBatches,
                successRate:
                    totalFiles > 0
                        ? (
                              ((totalFiles -
                                  this.streamingMetrics.failedBatches) /
                                  totalFiles) *
                              100
                          ).toFixed(2) + '%'
                        : '100%',
            },
            serviceName: CodeKnowledgeGraphService.name,
        });
    }

    public async buildGraphStreaming(
        rootDir: string,
        filePaths: string[],
    ): Promise<CodeGraph> {
        const t0 = performance.now();
        const hr0 = process.hrtime();

        if (!rootDir || rootDir.trim() === '') {
            const error = new Error(`Root directory can't be empty ${rootDir}`);
            (error as any).errorType = 'BUSINESS_ERROR';
            throw error;
        }

        try {
            await fs.promises.access(rootDir, fs.constants.F_OK);
        } catch {
            const error = new Error(`Root directory not found: ${rootDir}`);
            (error as any).errorType = 'BUSINESS_ERROR';
            throw error;
        }

        const result: CodeGraph = {
            files: new Map<string, FileAnalysis>(),
            functions: new Map<string, FunctionAnalysis>(),
            types: new Map<string, TypeAnalysis>(),
        };

        const sourceFiles = await this.getAllSourceFiles(rootDir);
        const filteredFiles =
            filePaths.length > 0
                ? sourceFiles.filter((file) =>
                      filePaths.some((keyword) => file.includes(keyword)),
                  )
                : sourceFiles;

        if (filteredFiles.length === 0) {
            this.logger.warn({
                message: 'No source files found',
                context: CodeKnowledgeGraphService.name,
                metadata: { rootDir },
                serviceName: CodeKnowledgeGraphService.name,
            });
            return result;
        }

        const totalFiles = filteredFiles.length;
        this.logger.log({
            message: 'Starting streaming analysis',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                rootDir,
                totalFiles,
            },
            serviceName: CodeKnowledgeGraphService.name,
        });

        for await (const batchProgress of this.processFilesInBatches(
            filteredFiles,
            rootDir,
        )) {
            const { batch } = batchProgress;

            batch.files.forEach((file) => {
                result.files.set(
                    file.normalizedPath,
                    file.analysis.fileAnalysis,
                );

                if (file.analysis.functions) {
                    for (const [k, v] of file.analysis.functions.entries()) {
                        result.functions.set(k, v);
                    }
                }

                if (file.analysis.types) {
                    for (const [k, v] of file.analysis.types.entries()) {
                        result.types.set(k, v);
                    }
                }
            });

            batch.errors.forEach((error) => {
                this.logger.warn({
                    message: 'Error in streaming batch',
                    context: CodeKnowledgeGraphService.name,
                    error,
                    metadata: { batchIndex: batchProgress.batchIndex },
                    serviceName: CodeKnowledgeGraphService.name,
                });
            });
        }

        this.completeBidirectionalTypeRelations(result.types);

        const streamingTime = performance.now() - t0;
        const [s, ns] = process.hrtime(hr0);
        const hrtimeMs = s * 1e3 + ns / 1e6;

        this.logger.debug({
            message: 'Streaming performance metrics',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                streamingTimeMs: streamingTime.toFixed(3),
                hrtimeMs: hrtimeMs.toFixed(3),
            },
            serviceName: CodeKnowledgeGraphService.name,
        });

        return result;
    }

    private forceGarbageCollection(): void {
        if (global.gc && Date.now() - this.lastGcTime > this.gcIntervalMs) {
            try {
                global.gc();
                this.lastGcTime = Date.now();
                this.logger.debug({
                    message: 'Forced garbage collection',
                    context: CodeKnowledgeGraphService.name,
                    serviceName: CodeKnowledgeGraphService.name,
                });
            } catch (error) {
                this.logger.warn({
                    message: 'Failed to force garbage collection',
                    context: CodeKnowledgeGraphService.name,
                    error,
                    serviceName: CodeKnowledgeGraphService.name,
                });
            }
        }
    }

    public async buildGraphProgressively(
        rootDir: string,
        filePaths: string[],
    ): Promise<CodeGraph> {
        const t0 = performance.now();
        const hr0 = process.hrtime();

        if (!rootDir || rootDir.trim() === '') {
            const error = new Error(`Root directory can't be empty ${rootDir}`);
            (error as any).errorType = 'BUSINESS_ERROR';
            throw error;
        }

        try {
            await fs.promises.access(rootDir, fs.constants.F_OK);
        } catch {
            const error = new Error(`Root directory not found: ${rootDir}`);
            (error as any).errorType = 'BUSINESS_ERROR';
            throw error;
        }

        const result: CodeGraph = {
            files: new Map<string, FileAnalysis>(),
            functions: new Map<string, FunctionAnalysis>(),
            types: new Map<string, TypeAnalysis>(),
        };

        const sourceFiles = await this.getAllSourceFiles(rootDir);

        const filteredFiles =
            filePaths.length > 0
                ? sourceFiles.filter((file) =>
                      filePaths.some((keyword) => file.includes(keyword)),
                  )
                : sourceFiles;

        if (filteredFiles.length === 0) {
            this.logger.warn({
                message: 'No source files found',
                context: CodeKnowledgeGraphService.name,
                metadata: {
                    rootDir,
                },
                serviceName: CodeKnowledgeGraphService.name,
            });
            return result;
        }

        const totalFiles = filteredFiles.length;
        this.logger.log({
            message: 'Starting progressive analysis',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                rootDir,
                totalFiles,
            },
            serviceName: CodeKnowledgeGraphService.name,
        });

        const cpuCount = os.cpus().length;
        const batchSize = Math.max(7, Math.min(cpuCount * 5, 50));

        const batches = Array.from(
            { length: Math.ceil(totalFiles / batchSize) },
            (_, i) => filteredFiles.slice(i * batchSize, (i + 1) * batchSize),
        );

        const processBatch = async (
            batchFiles: string[],
        ): Promise<WorkerOutput> => {
            return this.processBatch(batchFiles, rootDir);
        };

        const batchResults = await Promise.allSettled(
            batches.map((batchFiles) => processBatch(batchFiles)),
        );

        batchResults.forEach((resultItem, index) => {
            if (resultItem.status === 'fulfilled') {
                const item = resultItem.value;
                item.files.forEach((file) => {
                    result.files.set(
                        file.normalizedPath,
                        file.analysis.fileAnalysis,
                    );

                    if (file.analysis.functions) {
                        for (const [
                            k,
                            v,
                        ] of file.analysis.functions.entries()) {
                            result.functions.set(k, v);
                        }
                    }

                    if (file.analysis.types) {
                        for (const [k, v] of file.analysis.types.entries()) {
                            result.types.set(k, v);
                        }
                    }
                });

                item.errors.forEach((error) => {
                    this.logger.warn({
                        message: 'Error in batch processing',
                        context: CodeKnowledgeGraphService.name,
                        error,
                        metadata: {
                            index,
                            batchFiles: batches[index],
                        },
                        serviceName: CodeKnowledgeGraphService.name,
                    });
                });
            } else {
                this.logger.warn({
                    message: 'Failed to process batch',
                    context: CodeKnowledgeGraphService.name,
                    error: resultItem.reason,
                    metadata: {
                        index,
                        batchFiles: batches[index],
                    },
                    serviceName: CodeKnowledgeGraphService.name,
                });
            }
        });

        this.completeBidirectionalTypeRelations(result.types);

        const progressiveTime = performance.now() - t0;
        const [s, ns] = process.hrtime(hr0);
        const hrtimeMs = s * 1e3 + ns / 1e6;

        this.logger.debug({
            message: 'Progressive performance metrics',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                progressiveTimeMs: progressiveTime.toFixed(3),
                hrtimeMs: hrtimeMs.toFixed(3),
            },
            serviceName: CodeKnowledgeGraphService.name,
        });

        return result;
    }

    private async calculateAdaptiveTimeout(
        batchFiles: string[],
    ): Promise<number> {
        const baseTimeoutMs = 60000;
        const batchSize = batchFiles.length;

        let sizeMultiplier = 1;
        if (batchSize > 100) {
            sizeMultiplier = 2.5;
        } else if (batchSize > 50) {
            sizeMultiplier = 2.0;
        } else if (batchSize > 20) {
            sizeMultiplier = 1.5;
        }

        let complexityMultiplier = 1;
        let totalFileSize = 0;
        let largeFiles = 0;

        for (const file of batchFiles) {
            try {
                const stats = await fs.promises.stat(file);
                totalFileSize += stats.size;
                if (stats.size > 50000) {
                    largeFiles++;
                }
            } catch {}
        }

        const avgFileSize = totalFileSize / batchFiles.length;
        const largeFileRatio = largeFiles / batchFiles.length;

        if (avgFileSize > 100000 || largeFileRatio > 0.5) {
            complexityMultiplier = 1.8;
        } else if (avgFileSize > 50000 || largeFileRatio > 0.3) {
            complexityMultiplier = 1.4;
        }

        const adaptiveTimeout = Math.min(
            Math.max(
                baseTimeoutMs * sizeMultiplier * complexityMultiplier,
                30000,
            ),
            300000,
        );

        return Math.round(adaptiveTimeout);
    }

    private calculateOptimalBatchSize(
        cpuCount: number,
        totalFiles: number,
    ): number {
        let baseBatchSize = Math.max(20, Math.min(cpuCount * 8, 100));

        if (totalFiles > 20000) {
            baseBatchSize = Math.min(baseBatchSize, 30);
        } else if (totalFiles > 10000) {
            baseBatchSize = Math.min(baseBatchSize, 40);
        } else if (totalFiles > 5000) {
            baseBatchSize = Math.min(baseBatchSize, 50);
        }

        try {
            const memoryUsage = process.memoryUsage();
            const heapUsageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;

            if (heapUsageRatio > 0.8) {
                baseBatchSize = Math.max(5, Math.floor(baseBatchSize * 0.6));
            } else if (heapUsageRatio > 0.6) {
                baseBatchSize = Math.max(8, Math.floor(baseBatchSize * 0.8));
            }
        } catch {}

        return baseBatchSize;
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    private clearBatchCache(): void {
        try {
            if (this.piscina?.queueSize > 0) {
                this.logger.debug({
                    message: 'Clearing worker queue cache',
                    context: CodeKnowledgeGraphService.name,
                    metadata: {
                        queueSize: this.piscina.queueSize,
                    },
                    serviceName: CodeKnowledgeGraphService.name,
                });
            }

            const memoryUsage = process.memoryUsage();
            const heapUsageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;

            // Force garbage collection if heap usage exceeds threshold
            if (heapUsageRatio > this.gcThreshold) {
                this.forceGarbageCollection();
            }

            if (heapUsageRatio > 0.5) {
                if (this.streamingMetrics.filesProcessed > 1000) {
                    this.streamingMetrics.averageProcessingTime = 0;
                    this.streamingMetrics.lastBatchTime = 0;
                }
            }
        } catch (error) {
            this.logger.warn({
                message: 'Error during batch cache cleanup',
                context: CodeKnowledgeGraphService.name,
                error: error instanceof Error ? error.message : String(error),
                serviceName: CodeKnowledgeGraphService.name,
            });
        }
    }

    private updateStreamingMetrics(
        batchTime: number,
        filesProcessed: number,
    ): void {
        this.streamingMetrics.filesProcessed += filesProcessed;

        const currentAvg = this.streamingMetrics.averageProcessingTime;
        const newTime = batchTime / filesProcessed;
        this.streamingMetrics.averageProcessingTime =
            (currentAvg + newTime) / 2;

        this.streamingMetrics.lastBatchTime = performance.now();

        // Update memory usage metrics
        const memoryUsage = process.memoryUsage();
        this.streamingMetrics.memoryUsage = Math.max(
            this.streamingMetrics.memoryUsage,
            memoryUsage.heapUsed / 1024 / 1024, // Convert to MB
        );
    }

    private async processBatch(
        batchFiles: string[],
        rootDir: string,
        retryCount: number = 0,
    ): Promise<WorkerOutput> {
        const maxRetries = 3;

        try {
            const adaptiveTimeout =
                await this.calculateAdaptiveTimeout(batchFiles);

            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(
                        new Error(
                            `Timeout while processing batch (${adaptiveTimeout}ms timeout, batch size: ${batchFiles.length})`,
                        ),
                    );
                }, adaptiveTimeout);
            });

            const analysis = await Promise.race([
                this.piscina.run(
                    {
                        rootDir,
                        batch: batchFiles,
                    },
                    { name: 'analyzeBatch' },
                ),
                timeoutPromise,
            ]);

            return analysis;
        } catch (error) {
            const isTimeoutError =
                error instanceof Error &&
                error.message.includes('Timeout while processing batch');

            if (isTimeoutError) {
                this.streamingMetrics.timeoutCount++;
            }
            if (retryCount > 0) {
                this.streamingMetrics.retryCount++;
            }

            if (isTimeoutError && retryCount < maxRetries) {
                const backoffMs = Math.min(
                    1000 * Math.pow(2, retryCount),
                    10000,
                );

                this.logger.debug({
                    message: 'Batch timeout, retrying with exponential backoff',
                    context: CodeKnowledgeGraphService.name,
                    error: error.message,
                    metadata: {
                        batchSize: batchFiles.length,
                        retryCount: retryCount + 1,
                        maxRetries,
                        backoffMs,
                        totalTimeouts: this.streamingMetrics.timeoutCount,
                        totalRetries: this.streamingMetrics.retryCount,
                    },
                    serviceName: CodeKnowledgeGraphService.name,
                });

                await new Promise((resolve) => setTimeout(resolve, backoffMs));

                return this.processBatch(batchFiles, rootDir, retryCount + 1);
            }

            this.streamingMetrics.failedBatches++;

            throw error;
        }
    }

    public getStreamingMetrics(): StreamingMetrics & {
        uptime: number;
        filesPerSecond: number;
    } {
        const uptime =
            this.streamingMetrics.startTime > 0
                ? performance.now() - this.streamingMetrics.startTime
                : 0;

        const filesPerSecond =
            uptime > 0
                ? this.streamingMetrics.filesProcessed / (uptime / 1000)
                : 0;

        return {
            ...this.streamingMetrics,
            uptime,
            filesPerSecond,
        };
    }

    public resetStreamingMetrics(): void {
        this.streamingMetrics = {
            filesProcessed: 0,
            averageProcessingTime: 0,
            memoryUsage: 0,
            startTime: 0,
            lastBatchTime: 0,
            timeoutCount: 0,
            retryCount: 0,
            failedBatches: 0,
        };
    }

    private completeBidirectionalTypeRelations(
        types: Map<string, TypeAnalysis>,
    ): void {
        Array.from(types.entries()).forEach(([typeName, typeInfo]) => {
            if (typeInfo.implements) {
                typeInfo.implements.forEach((interfaceName) => {
                    const interfaceType = types.get(interfaceName);
                    if (interfaceType) {
                        if (!interfaceType.implementedBy) {
                            interfaceType.implementedBy = [];
                        }
                        if (!interfaceType.implementedBy.includes(typeName)) {
                            interfaceType.implementedBy.push(typeName);
                        }
                        types.set(interfaceName, interfaceType);
                    }
                });
            }

            if (typeInfo.extends) {
                typeInfo.extends.forEach((parentName) => {
                    const parentType = types.get(parentName);
                    if (parentType) {
                        if (!parentType.extendedBy) {
                            parentType.extendedBy = [];
                        }
                        if (!parentType.extendedBy.includes(typeName)) {
                            parentType.extendedBy.push(typeName);
                        }
                        types.set(parentName, parentType);
                    }
                });
            }
        });
    }
}
