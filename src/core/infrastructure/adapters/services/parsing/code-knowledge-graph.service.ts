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

// Types para streaming
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
    };

    // Configurações para streaming
    private readonly memoryThreshold = 0.8; // 80% de uso de memória
    private readonly batchPauseMs = 100; // Pausa entre lotes quando necessário

    constructor(
        @Inject(PinoLoggerService) private readonly logger: PinoLoggerService,
    ) {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);

        // Se estamos rodando de src/ (tsx), precisamos apontar para dist/
        // Se estamos rodando de dist/ (node), já estamos no lugar certo
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
            throw new Error(
                `Worker file not found at ${workerPath}. Ensure 'yarn build' has been run.`,
            );
        }

        const cpuCount = os.cpus().length;
        const minThreads = cpuCount - 1;
        const maxThreads = cpuCount - 1;
        const idleTimeout = 30000;
        const maxQueue = 1000;
        const concurrentTasksPerWorker = 1;

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

    /**
     * ✅ Streaming com AsyncGenerator - Maior impacto imediato na performance
     * Processa arquivos em lotes de forma streaming, com controle de backpressure
     */
    public async *processFilesInBatches(
        files: string[],
        rootDir: string,
    ): AsyncGenerator<BatchProgress> {
        if (files.length === 0) {
            return;
        }

        // Inicializar métricas
        this.streamingMetrics.startTime = performance.now();
        this.streamingMetrics.lastBatchTime = this.streamingMetrics.startTime;

        // Calcular tamanho do lote otimizado para streaming
        const cpuCount = os.cpus().length;
        const batchSize = this.calculateOptimalBatchSize(
            cpuCount,
            files.length,
        );

        // Dividir arquivos em lotes
        const batches = this.chunkArray(files, batchSize);
        const totalFiles = files.length;
        let processedFiles = 0;

        this.logger.log({
            message: 'Starting streaming file processing',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                totalFiles,
                batchSize,
                totalBatches: batches.length,
            },
            serviceName: CodeKnowledgeGraphService.name,
        });

        // Processar cada lote de forma streaming
        for (let i = 0; i < batches.length; i++) {
            const batchStartTime = performance.now();

            try {
                // Controle de backpressure - pausar se memória alta
                if (this.shouldPauseForMemory()) {
                    await this.waitForMemory();
                }

                // Processar lote
                const batchResult = await this.processBatch(
                    batches[i],
                    rootDir,
                );

                // Atualizar métricas
                processedFiles += batchResult.files.length;
                const batchTime = performance.now() - batchStartTime;
                this.updateStreamingMetrics(
                    batchTime,
                    batchResult.files.length,
                );

                const progress = (processedFiles / totalFiles) * 100;

                // Yield resultado do lote
                yield {
                    batch: batchResult,
                    progress,
                    processedFiles,
                    totalFiles,
                    batchIndex: i,
                    totalBatches: batches.length,
                };

                // Log de progresso a cada 10% ou a cada 100 arquivos
                if (
                    i % Math.ceil(batches.length / 10) === 0 ||
                    processedFiles % 100 === 0
                ) {
                    this.logger.log({
                        message: 'Streaming progress update',
                        context: CodeKnowledgeGraphService.name,
                        metadata: {
                            progress: progress.toFixed(2),
                            processedFiles,
                            totalFiles,
                            batchIndex: i,
                            totalBatches: batches.length,
                            memoryUsage:
                                this.streamingMetrics.memoryUsage.toFixed(2),
                            avgProcessingTime:
                                this.streamingMetrics.averageProcessingTime.toFixed(
                                    2,
                                ),
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

                // Continuar com próximo lote mesmo em caso de erro
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

        // Log final
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
            },
            serviceName: CodeKnowledgeGraphService.name,
        });
    }

    /**
     * Método principal de streaming que substitui buildGraphProgressively
     * Mantém compatibilidade com a interface existente
     */
    public async buildGraphStreaming(
        rootDir: string,
        filePaths: string[],
    ): Promise<CodeGraph> {
        console.time('streaming-task-ms');
        const t0 = performance.now();
        const hr0 = process.hrtime();

        if (!rootDir || rootDir.trim() === '') {
            throw new Error(`Root directory can't be empty ${rootDir}`);
        }

        try {
            await fs.promises.access(rootDir, fs.constants.F_OK);
        } catch {
            throw new Error(`Root directory not found: ${rootDir}`);
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
        console.log(
            `Streaming analysis of ${rootDir} with ${totalFiles} files...`,
        );

        // Processar arquivos usando streaming
        for await (const batchProgress of this.processFilesInBatches(
            filteredFiles,
            rootDir,
        )) {
            const { batch } = batchProgress;

            // Processar resultados do lote
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

            // Log de erros do lote
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

        // Completar relações bidirecionais de tipos
        this.completeBidirectionalTypeRelations(result.types);

        console.timeEnd('streaming-task-ms');
        console.log(
            'streaming_perf_hooks:',
            (performance.now() - t0).toFixed(3) + ' ms',
        );
        const [s, ns] = process.hrtime(hr0);
        console.log(
            'streaming_hrtime:',
            (s * 1e3 + ns / 1e6).toFixed(3) + ' ms',
        );

        return result;
    }

    public async buildGraphProgressively(
        rootDir: string,
        filePaths: string[],
    ): Promise<CodeGraph> {
        console.time('task-ms');
        const t0 = performance.now();
        const hr0 = process.hrtime();

        if (!rootDir || rootDir.trim() === '') {
            throw new Error(`Root directory can't be empty ${rootDir}`);
        }

        try {
            await fs.promises.access(rootDir, fs.constants.F_OK);
        } catch {
            throw new Error(`Root directory not found: ${rootDir}`);
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
        console.log(`Analyzing ${rootDir} with ${totalFiles} files...`);

        const cpuCount = os.cpus().length;
        const batchSize = Math.max(7, Math.min(cpuCount * 5, 50));

        const batches = Array.from(
            { length: Math.ceil(totalFiles / batchSize) },
            (_, i) => filteredFiles.slice(i * batchSize, (i + 1) * batchSize),
        );

        const processBatch = async (
            batchFiles: string[],
        ): Promise<WorkerOutput> => {
            try {
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`Timeout while processing batch`));
                    }, 60000);
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
                this.logger.error({
                    message: 'Error processing batch',
                    context: CodeKnowledgeGraphService.name,
                    error,
                    metadata: {
                        batchFiles,
                    },
                    serviceName: CodeKnowledgeGraphService.name,
                });
                throw error;
            }
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

        console.timeEnd('task-ms'); // ms via Date
        console.log('perf_hooks:', (performance.now() - t0).toFixed(3) + ' ms');
        const [s, ns] = process.hrtime(hr0);
        console.log('hrtime:', (s * 1e3 + ns / 1e6).toFixed(3) + ' ms');

        return result;
    }

    /**
     * Calcula o tamanho otimizado do lote baseado em CPU e número de arquivos
     */
    private calculateOptimalBatchSize(
        cpuCount: number,
        totalFiles: number,
    ): number {
        // Para streaming, usar lotes menores que o método original
        const baseBatchSize = Math.max(5, Math.min(cpuCount * 3, 25));

        // Ajustar baseado no número total de arquivos
        if (totalFiles > 10000) {
            return Math.min(baseBatchSize, 15);
        }
        if (totalFiles > 5000) {
            return Math.min(baseBatchSize, 20);
        }

        return baseBatchSize;
    }

    /**
     * Divide array em chunks
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Verifica se deve pausar devido ao uso de memória
     */
    private shouldPauseForMemory(): boolean {
        const memoryUsage = process.memoryUsage();
        const heapUsageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;

        this.streamingMetrics.memoryUsage = Math.max(
            this.streamingMetrics.memoryUsage,
            heapUsageRatio,
        );

        return heapUsageRatio > this.memoryThreshold;
    }

    /**
     * Pausa processamento para liberar memória
     */
    private async waitForMemory(): Promise<void> {
        this.logger.warn({
            message: 'Pausing streaming due to high memory usage',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                memoryUsage: this.streamingMetrics.memoryUsage.toFixed(2),
                threshold: this.memoryThreshold,
            },
            serviceName: CodeKnowledgeGraphService.name,
        });

        // Forçar garbage collection se disponível
        if (global.gc) {
            global.gc();
        }

        // Pausa para permitir liberação de memória
        await new Promise((resolve) => setTimeout(resolve, this.batchPauseMs));
    }

    /**
     * Atualiza métricas de streaming
     */
    private updateStreamingMetrics(
        batchTime: number,
        filesProcessed: number,
    ): void {
        this.streamingMetrics.filesProcessed += filesProcessed;

        // Calcular tempo médio de processamento
        const currentAvg = this.streamingMetrics.averageProcessingTime;
        const newTime = batchTime / filesProcessed;
        this.streamingMetrics.averageProcessingTime =
            (currentAvg + newTime) / 2;

        this.streamingMetrics.lastBatchTime = performance.now();
    }

    /**
     * Método processBatch otimizado para streaming
     */
    private async processBatch(
        batchFiles: string[],
        rootDir: string,
    ): Promise<WorkerOutput> {
        try {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Timeout while processing batch`));
                }, 60000);
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
            this.logger.error({
                message: 'Error processing batch',
                context: CodeKnowledgeGraphService.name,
                error,
                metadata: {
                    batchFiles,
                },
                serviceName: CodeKnowledgeGraphService.name,
            });
            throw error;
        }
    }

    /**
     * Obtém métricas atuais de streaming
     */
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

    /**
     * Reseta métricas de streaming
     */
    public resetStreamingMetrics(): void {
        this.streamingMetrics = {
            filesProcessed: 0,
            averageProcessingTime: 0,
            memoryUsage: 0,
            startTime: 0,
            lastBatchTime: 0,
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

    private objectToMap<T>(obj: Record<string, T>): Map<string, T> {
        const map = new Map<string, T>();
        if (obj && typeof obj === 'object') {
            Object.entries(obj).forEach(([key, value]) => {
                map.set(key, value);
            });
        }
        return map;
    }
}
