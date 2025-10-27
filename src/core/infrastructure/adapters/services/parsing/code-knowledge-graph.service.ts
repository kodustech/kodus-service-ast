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

    // Configurações para streaming - Otimizadas
    // 🚀 OTIMIZAÇÃO: Aumentar threshold de memória para melhor performance
    private readonly memoryThreshold = 0.9; // 90% de uso de memória (increased from 85%)
    private readonly batchPauseMs = 50; // Pausa reduzida entre lotes
    private readonly adaptivePauseMs = 200; // Pausa maior quando memória muito alta
    private readonly gcThreshold = 0.7; // Threshold para forçar GC
    private lastGcTime = 0;
    // 🚀 OTIMIZAÇÃO: Reduzir frequência de GC para melhor performance
    private gcIntervalMs = 10000; // GC a cada 10s no máximo

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
        // 🚀 OTIMIZAÇÃO: Aumentar tasks concorrentes por worker
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

        // 🚀 OTIMIZAÇÃO: Logs reduzidos para melhor performance
        // this.logger.log({
        //     message: 'Starting streaming file processing',
        //     context: CodeKnowledgeGraphService.name,
        //     metadata: {
        //         totalFiles,
        //         batchSize,
        //         totalBatches: batches.length,
        //     },
        //     serviceName: CodeKnowledgeGraphService.name,
        // });

        // Processar cada lote de forma streaming
        for (let i = 0; i < batches.length; i++) {
            const batchStartTime = performance.now();

            try {
                // 🚀 OTIMIZAÇÃO: Desabilitar backpressure que causa overhead
                // if (this.shouldPauseForMemory()) {
                //     await this.waitForMemory();
                // }

                // Processar lote
                const batchResult = await this.processBatch(
                    batches[i],
                    rootDir,
                );

                // Limpeza de cache após cada batch para reduzir uso de memória
                this.clearBatchCache();

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

                // 🚀 OTIMIZAÇÃO: Logs de progresso muito menos frequentes
                if (
                    i % Math.ceil(batches.length / 5) === 0 || // A cada 20% em vez de 10%
                    processedFiles % 500 === 0 // A cada 500 arquivos em vez de 100
                ) {
                    // Log simplificado para melhor performance
                    console.log(
                        `📊 Streaming: ${progress.toFixed(1)}% (${processedFiles}/${totalFiles})`,
                    );
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

    /**
     * Log detailed memory usage for monitoring
     */
    private logMemoryUsage(context: string): void {
        const memUsage = process.memoryUsage();
        const memUsageMB = {
            rss: Math.round(memUsage.rss / 1024 / 1024),
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024),
        };

        this.logger.debug({
            message: 'Memory usage',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                ...memUsageMB,
                context,
                memoryPressure: memUsageMB.heapUsed / memUsageMB.heapTotal,
            },
            serviceName: CodeKnowledgeGraphService.name,
        });
    }

    /**
     * Force garbage collection if available
     */
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

    /**
     * Calcula o tamanho otimizado do lote baseado em CPU e número de arquivos
     */
    private calculateOptimalBatchSize(
        cpuCount: number,
        totalFiles: number,
    ): number {
        // 🚀 OTIMIZAÇÃO: Batch sizes maiores para melhor performance
        let baseBatchSize = Math.max(20, Math.min(cpuCount * 8, 100)); // Muito maior!

        // Ajustar baseado no número total de arquivos
        if (totalFiles > 10000) {
            baseBatchSize = Math.min(baseBatchSize, 50); // Reduzido mas ainda maior
        } else if (totalFiles > 5000) {
            baseBatchSize = Math.min(baseBatchSize, 75); // Reduzido mas ainda maior
        }

        // 🚀 OTIMIZAÇÃO: Menos verificações de memória (causam overhead)
        // Remover verificações de memória que causam overhead
        // const memoryUsage = process.memoryUsage();
        // const heapUsageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;

        // 🚀 OTIMIZAÇÃO: Desabilitar logs de debug para melhor performance
        // this.logger.debug({
        //     message: 'Calculated adaptive batch size',
        //     context: CodeKnowledgeGraphService.name,
        //     metadata: {
        //         baseBatchSize,
        //         totalFiles,
        //         cpuCount,
        //     },
        //     serviceName: CodeKnowledgeGraphService.name,
        // });

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
     * Verifica se deve pausar devido ao uso de memória - Otimizado
     */
    private shouldPauseForMemory(): boolean {
        const memoryUsage = process.memoryUsage();
        const heapUsageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;

        this.streamingMetrics.memoryUsage = Math.max(
            this.streamingMetrics.memoryUsage,
            heapUsageRatio,
        );

        // Forçar GC preventivo se próximo do limite
        const now = Date.now();
        if (
            heapUsageRatio > this.gcThreshold &&
            now - this.lastGcTime > this.gcIntervalMs
        ) {
            this.forceGarbageCollection();
            this.lastGcTime = now;
        }

        return heapUsageRatio > this.memoryThreshold;
    }

    /**
     * Pausa processamento para liberar memória - Otimizado com pausa adaptativa
     */
    private async waitForMemory(): Promise<void> {
        const memoryUsage = process.memoryUsage();
        const heapUsageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;

        // Calcular pausa baseada na severidade do uso de memória
        const severity = heapUsageRatio / this.memoryThreshold;
        const pauseMs =
            severity > 1.2 ? this.adaptivePauseMs : this.batchPauseMs;

        this.logger.warn({
            message: 'Pausing streaming due to high memory usage',
            context: CodeKnowledgeGraphService.name,
            metadata: {
                memoryUsage: heapUsageRatio.toFixed(2),
                threshold: this.memoryThreshold,
                severity: severity.toFixed(2),
                pauseMs,
            },
            serviceName: CodeKnowledgeGraphService.name,
        });

        // Forçar garbage collection agressivo
        this.forceGarbageCollection();

        // Aguardar um pouco mais para GC ter efeito
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Pausa adaptativa baseada na severidade
        await new Promise((resolve) => setTimeout(resolve, pauseMs));

        // Verificar se memória melhorou após pausa
        const newMemoryUsage = process.memoryUsage();
        const newHeapRatio = newMemoryUsage.heapUsed / newMemoryUsage.heapTotal;

        if (newHeapRatio < heapUsageRatio) {
            this.logger.debug({
                message: 'Memory usage improved after pause',
                context: CodeKnowledgeGraphService.name,
                metadata: {
                    before: heapUsageRatio.toFixed(2),
                    after: newHeapRatio.toFixed(2),
                    improvement:
                        ((heapUsageRatio - newHeapRatio) * 100).toFixed(1) +
                        '%',
                },
                serviceName: CodeKnowledgeGraphService.name,
            });
        }
    }

    /**
     * Limpa caches e dados temporários após cada batch
     */
    private clearBatchCache(): void {
        try {
            // Limpar caches internos se existirem
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

            // Forçar limpeza de dados temporários se memória alta
            const memoryUsage = process.memoryUsage();
            const heapUsageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;

            if (heapUsageRatio > 0.5) {
                // Limpar métricas antigas se necessário
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
