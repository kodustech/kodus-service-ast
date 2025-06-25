import { Injectable } from '@nestjs/common';
import * as fg from 'fast-glob';
import * as fs from 'fs';
import * as os from 'os';
import {
    CodeGraph,
    FileAnalysis,
    FunctionAnalysis,
    TypeAnalysis,
} from '@kodus/kodus-proto/v2';

import { Piscina } from 'piscina';
import * as path from 'path';
import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages';
import { ParserAnalysis } from '@/core/domain/parsing/types/parser';
import { PinoLoggerService } from '../logger/pino.service';

@Injectable()
export class CodeKnowledgeGraphService {
    private piscina: Piscina;

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
        onProgress?: (processed: number, total: number) => void,
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

        const filterCriteria: string[] = [
            // 'get-reactions.use-case.ts',
            // 'save-feedback.use-case.ts',
            // 'codeReviewFeedback.controller.ts',
            // 'index.type.ts',
            // 'runCodeReview.use-case.ts',
            // 'codeManagement.service.ts',
            // 'integration-config.service.contracts.ts',
            // 'integration-config.repository.contracts.ts',
            // 'integrationConfig.service.ts',
            // 'user.py',
            // 'example.rb',
            // 'src/core/application/use-cases/codeReviewFeedback',
            // 'src/core/application/use-cases/codeBase/diff_test',
            // 'src/core/application/use-cases/codeBase/php_project',
            // 'manimlib/utils/tex_file_writing.py',
            // 'update_kody_rules.js',
            // 'fooooooooooooooooooooooooooooooo',
        ];
        const filteredFiles =
            filterCriteria.length > 0
                ? sourceFiles.filter((file) =>
                      filterCriteria.some((keyword) => file.includes(keyword)),
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
        let processedCount = 0;

        const processBatches = async () => {
            for (let i = 0; i < totalFiles; i += batchSize) {
                const batchFiles = filteredFiles.slice(
                    i,
                    Math.min(i + batchSize, totalFiles),
                );

                const batchResults = await Promise.allSettled(
                    batchFiles.map(async (filePath) => {
                        const normalizedPath = this.getNormalizedPath(
                            rootDir,
                            filePath,
                        );
                        try {
                            const timeoutPromise = new Promise<never>(
                                (_, reject) => {
                                    setTimeout(() => {
                                        reject(
                                            new Error(
                                                `Timeout while processing ${filePath}`,
                                            ),
                                        );
                                    }, 60000);
                                },
                            );

                            const analysis = await Promise.race<ParserAnalysis>(
                                [
                                    this.piscina.run(
                                        {
                                            rootDir,
                                            filePath,
                                            normalizedPath,
                                        },
                                        { name: 'analyze' },
                                    ),
                                    // new SourceFileAnalyzer().analyzeSourceFile(
                                    //     // path.join(
                                    //     //     rootDir,
                                    //     //     'src/core/application/use-cases/codeBase/php_project',
                                    //     // ),
                                    //     rootDir,
                                    //     filePath,
                                    //     normalizedPath,
                                    // ),
                                    timeoutPromise,
                                ],
                            );

                            const functionsMap: Map<string, FunctionAnalysis> =
                                analysis.functions instanceof Map
                                    ? analysis.functions
                                    : this.objectToMap(analysis.functions);

                            const typesMap: Map<string, TypeAnalysis> =
                                analysis.types instanceof Map
                                    ? analysis.types
                                    : this.objectToMap(analysis.types);

                            return {
                                filePath,
                                normalizedPath,
                                analysis: {
                                    fileAnalysis: analysis.fileAnalysis,
                                    functions: functionsMap,
                                    types: typesMap,
                                },
                            };
                        } catch (error) {
                            this.logger.error({
                                message: 'Error processing file',
                                context: CodeKnowledgeGraphService.name,
                                error,
                                metadata: {
                                    filePath,
                                    normalizedPath,
                                },
                                serviceName: CodeKnowledgeGraphService.name,
                            });
                            throw error;
                        }
                    }),
                );

                for (const resultItem of batchResults) {
                    if (resultItem.status === 'fulfilled') {
                        const item = resultItem.value;
                        result.files.set(
                            item.normalizedPath,
                            item.analysis.fileAnalysis,
                        );

                        if (item.analysis.functions) {
                            for (const [
                                k,
                                v,
                            ] of item.analysis.functions.entries()) {
                                result.functions.set(k, v);
                            }
                        }

                        if (item.analysis.types) {
                            for (const [
                                k,
                                v,
                            ] of item.analysis.types.entries()) {
                                result.types.set(k, v);
                            }
                        }
                    } else {
                        this.logger.warn({
                            message: 'Failed to process file',
                            context: CodeKnowledgeGraphService.name,
                            error: resultItem.reason,
                            metadata: {
                                resultItem,
                            },
                            serviceName: CodeKnowledgeGraphService.name,
                        });
                    }
                }

                processedCount += batchFiles.length;
                console.log(
                    `Processed ${processedCount} of ${totalFiles} files...`,
                );
                if (onProgress) {
                    onProgress(processedCount, totalFiles);
                }

                if (global.gc && i % (batchSize * 5) === 0) {
                    global.gc();
                }
            }
        };

        await processBatches();

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

    private getNormalizedPath(rootDir: string, filePath: string): string {
        return path.resolve(rootDir, filePath).replace(/\\/g, '/');
    }
}
