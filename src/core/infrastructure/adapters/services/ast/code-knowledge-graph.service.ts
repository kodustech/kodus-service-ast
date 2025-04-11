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

@Injectable()
export class CodeKnowledgeGraphService {
    private piscina: Piscina;

    constructor(
        @Inject('IImportPathResolver')
        private readonly importPathResolver: IImportPathResolver,
        private readonly resolverFactory: ResolverFactory,
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

    /**
     * Constrói o grafo de conhecimento progressivamente, reportando o progresso.
     * Esta abordagem é mais eficiente para repositórios grandes e permite
     * acompanhar o progresso da análise.
     *
     * @param rootDir Diretório raiz do repositório
     * @param onProgress Callback para reportar progresso (opcional)
     * @returns Grafo de conhecimento completo
     */
    public async buildGraphProgressively(
        rootDir: string,
        onProgress?: (processed: number, total: number) => void,
    ): Promise<CodeGraph> {
        // Validar se o diretório existe e não está vazio
        if (!rootDir || rootDir.trim() === '') {
            throw new Error(`Diretório raiz não pode ser vazio ${rootDir}`);
        }

        // Verificar se o diretório existe
        try {
            await fs.promises.access(rootDir, fs.constants.F_OK);
        } catch {
            throw new Error(`Diretório raiz não encontrado: ${rootDir}`);
        }

        console.time('buildGraphProgressively');
        await this.initializeImportResolver(rootDir);

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
            // 'src/ee/codeBase/ast/resolvers',
            // 'src/core/application/use-cases/codeBase/python_project',
        ];
        const filteredFiles =
            filterCriteria.length > 0
                ? sourceFiles.filter((file) =>
                      filterCriteria.some((keyword) => file.includes(keyword)),
                  )
                : sourceFiles;

        const totalFiles = filteredFiles.length;
        console.log(`Total de arquivos para análise: ${totalFiles}`);

        // Otimização: Calcular tamanho de lote baseado em número de CPUs e memória disponível
        // Usar um lote menor para evitar sobrecarga de memória
        const cpuCount = os.cpus().length;
        const batchSize = Math.max(5, Math.min(cpuCount * 3, 30)); // Aumentando o lote para melhor performance
        let processedCount = 0;

        // Análise com suporte a cancelamento e limitação de recursos
        const processBatches = async () => {
            // Implementar uma fila de processamento
            for (let i = 0; i < totalFiles; i += batchSize) {
                const batchFiles = filteredFiles.slice(
                    i,
                    Math.min(i + batchSize, totalFiles),
                );

                // Processamento paralelo otimizado com Promise.allSettled para processar todos os arquivos mesmo com falhas
                const batchResults = await Promise.allSettled(
                    batchFiles.map(async (filePath) => {
                        const normalizedPath =
                            this.importPathResolver.getNormalizedPath(filePath);
                        try {
                            // Processar arquivo com timeout
                            const timeoutPromise = new Promise<never>(
                                (_, reject) => {
                                    setTimeout(() => {
                                        reject(
                                            new Error(
                                                `Timeout ao processar arquivo ${filePath}`,
                                            ),
                                        );
                                    }, 60000); // 60 segundos timeout
                                },
                            );

                            // Corrida entre análise do arquivo e timeout
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
                                    timeoutPromise,
                                ],
                            );

                            // Converter resultados em Maps se vierem como objetos
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
                        } catch (error) {
                            // Registrar erro e continuar com próximo arquivo
                            console.error(
                                `Erro ao analisar arquivo ${filePath}:`,
                                error,
                            );
                            throw error; // Re-lançar o erro para que Promise.allSettled possa capturá-lo corretamente
                        }
                    }),
                );

                // Processar resultados do lote usando os métodos fulfilled/rejected do allSettled
                for (const resultItem of batchResults) {
                    if (resultItem.status === 'fulfilled') {
                        const item = resultItem.value;
                        // Mesclar fileAnalysis
                        result.files.set(
                            item.normalizedPath,
                            item.analysis.fileAnalysis,
                        );

                        // Mesclar functions de forma otimizada
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

                        // Mesclar types de forma otimizada
                        if (item.analysis.types) {
                            for (const [k, v] of (
                                item.analysis.types as Map<string, TypeAnalysis>
                            ).entries()) {
                                result.types.set(k, v);
                            }
                        }
                    } else {
                        // Arquivo falhou, mas nós continuamos o processamento
                        console.warn(
                            `Falha ao processar um arquivo: ${resultItem.reason}`,
                        );
                    }
                }

                // Atualizar progresso
                processedCount += batchFiles.length;
                if (onProgress) {
                    onProgress(processedCount, totalFiles);
                }

                // Liberar memória periodicamente
                if (global.gc && i % (batchSize * 5) === 0) {
                    global.gc();
                }
            }
        };

        await processBatches();

        // Completar relações bidirecionais
        this.completeBidirectionalTypeRelations(result.types);

        console.timeEnd('buildGraphProgressively');
        return result;
    }

    /**
     * Prepara o grafo para serialização JSON convertendo Maps para objetos.
     *
     * @param graph Grafo de conhecimento
     * @returns Grafo serializado
     */
    prepareGraphForSerialization(graph: CodeGraph): CodeGraph {
        const serialized: CodeGraph = {
            files: new Map<string, FileAnalysis>(),
            functions: new Map<string, FunctionAnalysis>(),
            types: new Map<string, TypeAnalysis>(),
        };

        // Converter Map de files para objeto
        for (const [key, value] of graph.files.entries()) {
            serialized.files[key] = value;
        }

        // Converter Map de functions para objeto
        for (const [key, value] of graph.functions.entries()) {
            serialized.functions[key] = value;
        }

        // Converter Map de types para objeto
        for (const [key, value] of graph.types.entries()) {
            serialized.types[key] = value;
        }

        return serialized;
    }

    /**
     * Converte um grafo serializado de volta para o formato com Maps.
     *
     * @param serialized Grafo serializado
     * @returns Grafo de conhecimento
     */
    private deserializeGraph(serialized: CodeGraph): CodeGraph {
        const graph: CodeGraph = {
            files: new Map(),
            functions: new Map(),
            types: new Map(),
        };

        // Converter objeto de files para Map
        if (serialized.files) {
            for (const [key, value] of Object.entries(serialized.files)) {
                graph.files.set(key, value as FileAnalysis);
            }
        }

        // Converter objeto de functions para Map
        if (serialized.functions) {
            for (const [key, value] of Object.entries(serialized.functions)) {
                graph.functions.set(key, value as FunctionAnalysis);
            }
        }

        // Converter objeto de types para Map
        if (serialized.types) {
            for (const [key, value] of Object.entries(serialized.types)) {
                graph.types.set(key, value as TypeAnalysis);
            }
        }

        return graph;
    }

    /**
     * Inicializa o resolver de imports para o diretório raiz.
     */
    private async initializeImportResolver(rootDir: string): Promise<void> {
        const resolver = await this.resolverFactory.getResolver(rootDir);
        this.importPathResolver.initialize(rootDir, resolver);
    }

    /**
     * Completa a relação bidirecional de tipos (interfaces e classes que implementam).
     */
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

    /**
     * Converte um objeto para Map
     * @param obj Objeto a ser convertido
     * @returns Map equivalente ao objeto
     */
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
