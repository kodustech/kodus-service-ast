import { Inject, Injectable } from '@nestjs/common';
import * as fg from 'fast-glob';
import * as fs from 'fs';
import * as os from 'os';
import { IImportPathResolver } from '@/core/domain/ast/contracts/ImportPathResolver';
import { ResolverFactory } from './resolvers/ResolverFactory';
import {
    CodeGraph,
    FileAnalysis,
    FunctionAnalysis,
    TypeAnalysis,
} from '@/core/domain/ast/contracts/CodeGraph';

import { Piscina } from 'piscina';
import * as path from 'path';
import { SUPPORTED_LANGUAGES } from '@/core/domain/ast/contracts/SupportedLanguages';
import { ParserAnalysis } from '@/core/domain/ast/contracts/Parser';
import { IMPORT_PATH_RESOLVER_TOKEN } from './import-path-resolver.service';
import { PinoLoggerService } from '../logger/pino.service';
import { handleError } from '@/shared/utils/errors';
import { SourceFileAnalyzer } from './analyze-source-file';

@Injectable()
export class CodeKnowledgeGraphService {
    private piscina: Piscina;

    constructor(
        @Inject(IMPORT_PATH_RESOLVER_TOKEN)
        private readonly importPathResolver: IImportPathResolver,
        private readonly resolverFactory: ResolverFactory,

        private readonly logger: PinoLoggerService,
    ) {
        this.piscina = new Piscina({
            // Piscina has no support for typescript, so we need to use the compiled version
            filename: path.resolve(__dirname, 'worker/worker.js'),
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
        if (!rootDir || rootDir.trim() === '') {
            throw new Error(`Root directory can't be empty ${rootDir}`);
        }

        try {
            await fs.promises.access(rootDir, fs.constants.F_OK);
        } catch {
            throw new Error(`Root directory not found: ${rootDir}`);
        }

        await this.initializeImportResolver(
            path.join(
                rootDir,
                'src/core/application/use-cases/codeBase/csharp_project',
            ),
        );
        if (!this.importPathResolver) {
            throw new Error(
                `Import path resolver not initialized for directory: ${rootDir}`,
            );
        }

        const result = {
            files: new Map<string, FileAnalysis>(),
            functions: new Map<string, FunctionAnalysis>(),
            types: new Map<string, TypeAnalysis>(),
            failedFiles: [],
        } as CodeGraph & {
            failedFiles: string[];
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
            'src/core/application/use-cases/codeBase/csharp_project',
            // 'manimlib/utils/tex_file_writing.py',
            // 'update_kody_rules.js',
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
            });
            return result;
        }

        const totalFiles = filteredFiles.length;
        console.log(`Analyzing ${rootDir} with ${totalFiles} files...`);

        const cpuCount = os.cpus().length;
        const batchSize = Math.max(5, Math.min(cpuCount * 3, 30));
        let processedCount = 0;

        const processBatches = async () => {
            for (let i = 0; i < totalFiles; i += batchSize) {
                const batchFiles = filteredFiles.slice(
                    i,
                    Math.min(i + batchSize, totalFiles),
                );

                const batchResults = await Promise.allSettled(
                    batchFiles.map(async (filePath) => {
                        const normalizedPath =
                            this.importPathResolver.getNormalizedPath(filePath);
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
                                    // this.piscina.run(
                                    //     {
                                    //         rootDir,
                                    //         filePath,
                                    //         normalizedPath,
                                    //     },
                                    //     { name: 'analyze' },
                                    // ),
                                    new SourceFileAnalyzer().analyzeSourceFile(
                                        rootDir,
                                        filePath,
                                        normalizedPath,
                                    ),
                                    timeoutPromise,
                                ],
                            );

                            const functionsMap =
                                analysis.functions instanceof Map
                                    ? analysis.functions
                                    : this.objectToMap(analysis.functions);

                            const typesMap =
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
                        } catch (err) {
                            this.logger.error({
                                message: 'Error processing file',
                                context: CodeKnowledgeGraphService.name,
                                error: handleError(err),
                                metadata: {
                                    filePath,
                                    normalizedPath,
                                },
                            });
                            throw err;
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
                            for (const [k, v] of (
                                item.analysis.functions as Map<
                                    string,
                                    FunctionAnalysis
                                >
                            ).entries()) {
                                result.functions.set(k, v);
                            }
                        }

                        if (item.analysis.types) {
                            for (const [k, v] of (
                                item.analysis.types as Map<string, TypeAnalysis>
                            ).entries()) {
                                result.types.set(k, v);
                            }
                        }
                    } else {
                        this.logger.warn({
                            message: 'Failed to process file',
                            context: CodeKnowledgeGraphService.name,
                            error: handleError(resultItem.reason),
                            metadata: {
                                resultItem,
                            },
                        });
                    }
                }

                processedCount += batchFiles.length;
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

        return result;
    }

    prepareGraphForSerialization(graph: CodeGraph): CodeGraph {
        const serialized: CodeGraph = {
            files: new Map<string, FileAnalysis>(),
            functions: new Map<string, FunctionAnalysis>(),
            types: new Map<string, TypeAnalysis>(),
        };

        for (const [key, value] of graph.files.entries()) {
            serialized.files[key] = value;
        }

        for (const [key, value] of graph.functions.entries()) {
            serialized.functions[key] = value;
        }

        for (const [key, value] of graph.types.entries()) {
            serialized.types[key] = value;
        }

        return serialized;
    }

    private deserializeGraph(serialized: CodeGraph): CodeGraph {
        const graph: CodeGraph = {
            files: new Map(),
            functions: new Map(),
            types: new Map(),
        };

        if (serialized.files) {
            for (const [key, value] of Object.entries(serialized.files)) {
                graph.files.set(key, value as FileAnalysis);
            }
        }

        if (serialized.functions) {
            for (const [key, value] of Object.entries(serialized.functions)) {
                graph.functions.set(key, value as FunctionAnalysis);
            }
        }

        if (serialized.types) {
            for (const [key, value] of Object.entries(serialized.types)) {
                graph.types.set(key, value as TypeAnalysis);
            }
        }

        return graph;
    }

    private async initializeImportResolver(rootDir: string): Promise<void> {
        const resolver = await this.resolverFactory.getResolver(rootDir);
        if (!resolver) {
            this.logger.error({
                message: 'No resolver found for the project',
                context: CodeKnowledgeGraphService.name,
                metadata: {
                    rootDir,
                },
            });
            throw new Error(`No resolver found for the project: ${rootDir}`);
        }
        this.importPathResolver.initialize(rootDir, resolver);
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
