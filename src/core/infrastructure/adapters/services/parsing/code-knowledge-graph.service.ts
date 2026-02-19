import {
    CodeGraph,
    FileAnalysis,
    FunctionAnalysis,
    TypeAnalysis,
} from '@/shared/types/ast.js';
import { Inject, Injectable } from '@nestjs/common';
import * as os from 'os';

import { existsSync } from 'fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Piscina } from 'piscina';
import { PinoLoggerService } from '../logger/pino.service.js';
import { WorkerInput, WorkerOutput } from './worker/worker.js';

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

            this.logger.error({
                message: 'Worker file path resolution failed',
                context: CodeKnowledgeGraphService.name,
                error,
                metadata: {
                    workerPath,
                    cwd: process.cwd(),
                    isRunningFromSource,
                },
                serviceName: CodeKnowledgeGraphService.name,
            });

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

        this.logger.log({
            message: 'CodeKnowledgeGraphService initialized',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                workerPath,
                cpuCount,
                minThreads,
                maxThreads,
                idleTimeout,
                maxQueue,
                concurrentTasksPerWorker,
            },
            serviceName: CodeKnowledgeGraphService.name,
        });
    }
    private async *processFilesInBatches(
        files: {
            id: string;
            content: string;
            filePath: string;
        }[],
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

        this.logger.log({
            message: 'Starting batch processing for file analysis',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                totalFiles,
                cpuCount,
                batchSize,
                totalBatches: batches.length,
            },
            serviceName: CodeKnowledgeGraphService.name,
        });

        for (let i = 0; i < batches.length; i++) {
            const batchStartTime = performance.now();
            const currentBatch = batches[i];

            this.logger.debug({
                message: 'Processing batch',
                context: CodeKnowledgeGraphService.name,
                metadata: {
                    batchIndex: i,
                    batchSize: currentBatch.length,
                    processedFiles,
                    totalFiles,
                },
                serviceName: CodeKnowledgeGraphService.name,
            });

            try {
                const batchResult = await this.processBatch(currentBatch, i);

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
                            batchIndex: i,
                            batchTimeMs: Math.round(batchTime),
                            batchErrorsCount: batchResult.errors.length,
                            queueSize: this.piscina.queueSize,
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
                        batchSize: currentBatch.length,
                        batchPaths: currentBatch.map((file) => file.filePath),
                        processedFiles,
                        totalFiles,
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
        files: {
            id: string;
            content: string;
            filePath: string;
        }[],
    ): Promise<CodeGraph> {
        const t0 = performance.now();
        const hr0 = process.hrtime();

        if (!Array.isArray(files) || files.length === 0) {
            throw new Error('No files provided for analysis');
        }

        const result: CodeGraph = {
            files: new Map<string, FileAnalysis>(),
            functions: new Map<string, FunctionAnalysis>(),
            types: new Map<string, TypeAnalysis>(),
        };

        this.logger.log({
            message: 'Starting streaming analysis',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                fileCount: files.length,
                queueSize: this.piscina.queueSize,
                completed: this.piscina.completed,
            },
            serviceName: CodeKnowledgeGraphService.name,
        });

        for await (const batchProgress of this.processFilesInBatches(files)) {
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
                    metadata: {
                        batchIndex: batchProgress.batchIndex,
                        progress: batchProgress.progress.toFixed(1),
                        processedFiles: batchProgress.processedFiles,
                        totalFiles: batchProgress.totalFiles,
                    },
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
                parsedFilesCount: result.files.size,
                parsedFunctionsCount: result.functions.size,
                parsedTypesCount: result.types.size,
                finalQueueSize: this.piscina.queueSize,
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

    private async calculateAdaptiveTimeout(
        batchFiles: {
            content: string;
        }[],
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
                const size = Buffer.byteLength(file.content || '', 'utf8');
                totalFileSize += size;
                if (size > 50000) {
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

            if (heapUsageRatio > this.memoryThreshold) {
                this.logger.warn({
                    message: 'High heap usage detected during batch cleanup',
                    context: CodeKnowledgeGraphService.name,
                    metadata: {
                        heapUsageRatio: heapUsageRatio.toFixed(3),
                        heapUsedMb: (
                            memoryUsage.heapUsed /
                            1024 /
                            1024
                        ).toFixed(2),
                        heapTotalMb: (
                            memoryUsage.heapTotal /
                            1024 /
                            1024
                        ).toFixed(2),
                    },
                    serviceName: CodeKnowledgeGraphService.name,
                });
            }

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
        batchFiles: {
            id: string;
            content: string;
            filePath: string;
        }[],
        batchIndex: number,
        retryCount: number = 0,
    ): Promise<WorkerOutput> {
        const maxRetries = 3;
        const runStart = performance.now();

        try {
            const adaptiveTimeout =
                await this.calculateAdaptiveTimeout(batchFiles);

            this.logger.debug({
                message: 'Dispatching batch to worker pool',
                context: CodeKnowledgeGraphService.name,
                metadata: {
                    batchIndex,
                    batchSize: batchFiles.length,
                    retryCount,
                    adaptiveTimeout,
                    queueSize: this.piscina.queueSize,
                },
                serviceName: CodeKnowledgeGraphService.name,
            });

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
                        batch: batchFiles,
                    },
                    { name: 'analyzeBatch' },
                ),
                timeoutPromise,
            ]);

            this.logger.debug({
                message: 'Batch processed successfully by worker pool',
                context: CodeKnowledgeGraphService.name,
                metadata: {
                    batchIndex,
                    batchSize: batchFiles.length,
                    retryCount,
                    durationMs: Math.round(performance.now() - runStart),
                    outputFiles: analysis.files.length,
                    outputErrors: analysis.errors.length,
                },
                serviceName: CodeKnowledgeGraphService.name,
            });

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
                        batchIndex,
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

                return this.processBatch(
                    batchFiles,
                    batchIndex,
                    retryCount + 1,
                );
            }

            this.streamingMetrics.failedBatches++;

            this.logger.error({
                message: 'Batch processing failed after retries',
                context: CodeKnowledgeGraphService.name,
                error,
                metadata: {
                    batchIndex,
                    batchSize: batchFiles.length,
                    retryCount,
                    maxRetries,
                    durationMs: Math.round(performance.now() - runStart),
                    timeoutCount: this.streamingMetrics.timeoutCount,
                    failedBatches: this.streamingMetrics.failedBatches,
                },
                serviceName: CodeKnowledgeGraphService.name,
            });

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
        const previousMetrics = this.streamingMetrics;

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

        this.logger.debug({
            message: 'Streaming metrics reset',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                previousMetrics,
            },
            serviceName: CodeKnowledgeGraphService.name,
        });
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
