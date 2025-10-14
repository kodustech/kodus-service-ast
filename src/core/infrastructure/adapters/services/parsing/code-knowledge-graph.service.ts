import { Injectable } from '@nestjs/common';
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
import * as path from 'path';
import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages.js';
import { PinoLoggerService } from '../logger/pino.service.js';
import { WorkerInput, WorkerOutput } from './worker/worker.js';

@Injectable()
export class CodeKnowledgeGraphService {
    private piscina: Piscina<WorkerInput, WorkerOutput>;

    constructor(private readonly logger: PinoLoggerService) {
        const cpuCount = os.cpus().length;
        const minThreads = cpuCount - 1;
        const maxThreads = cpuCount - 1;
        const idleTimeout = 30000;
        const maxQueue = 1000;
        const concurrentTasksPerWorker = 1;

        this.piscina = new Piscina({
            filename: path.resolve(__dirname, 'worker/worker.js'),
            minThreads,
            maxThreads,
            idleTimeout,
            maxQueue,
            concurrentTasksPerWorker,
        });
    }

    private async getAllSourceFiles(baseDir: string): Promise<string[]> {
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

        const processBatch = async (batchFiles: string[]) => {
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
                    // analyzeBatch({
                    //     rootDir,
                    //     batch: batchFiles,
                    // }),
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
