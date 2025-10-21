import * as fs from 'fs';
import { getParserByFilePath } from './parsers/index.js';
import { type BaseParser } from './parsers/base-parser.js';
import {
    type ParseContext,
    type ParserAnalysis,
} from '@/core/domain/parsing/types/parser.js';
import { getLanguageResolver } from './resolvers/index.js';
import { type LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract.js';
import {
    type AnalysisNode,
    type Call,
    type FunctionAnalysis,
    type TypeAnalysis,
} from '@/shared/types/ast.js';

export class SourceFileAnalyzer {
    private importPathResolver: LanguageResolver | null = null;
    private languageParser: BaseParser | null = null;

    async analyzeSourceFile(
        rootDir: string,
        filePath: string,
        absolutePath: string,
    ): Promise<ParserAnalysis> {
        try {
            await this.initializeImportResolver(rootDir);
            if (!this.importPathResolver) {
                console.warn(`No import resolver found for ${rootDir}`);
                return this.emptyAnalysis();
            }

            const content = await this.readFileContent(filePath);
            if (!content) {
                return this.emptyAnalysis();
            }

            const fileStats = await fs.promises.stat(filePath);
            const fileSizeInMB = fileStats?.size / (1024 * 1024);
            if (fileSizeInMB > 5) {
                console.warn(
                    `File too large for analysis (${fileSizeInMB.toFixed(2)}MB): ${filePath}`,
                );
                return this.emptyAnalysis();
            }

            const context: ParseContext = {
                filePath,
                fileDefines: new Set<string>(),
                fileImports: new Set<string>(),
                fileClassNames: new Set<string>(),
                functions: new Map<string, FunctionAnalysis>(),
                fileCalls: [] as Call[],
                importedMapping: new Map<string, string>(),
                instanceMapping: new Map<string, string>(),
                types: new Map<string, TypeAnalysis>(),
                analysisNodes: new Map<string, AnalysisNode>(),
                nodeIdMap: new Map<number, string>(),
                idMap: new Map<string, number>(),
            };

            this.languageParser = getParserByFilePath(
                filePath,
                this.importPathResolver,
                context,
            );
            if (!this.languageParser) {
                return this.emptyAnalysis();
            }

            const parser = this.languageParser.getParser();
            if (!parser) {
                return this.emptyAnalysis();
            }

            const syntaxTree = parser.parse(content);
            if (!syntaxTree) {
                return this.emptyAnalysis();
            }

            this.languageParser.collectAllInOnePass(
                syntaxTree.rootNode,
                filePath,
                absolutePath,
            );

            const uniqueImports = Array.from(context.fileImports);
            // 🚀 OTIMIZAÇÃO: Aumentar batch size para melhor throughput
            const batchSize = 20;
            const normalizedImports: string[] = [];

            // 🚀 FASE 1: Use original import resolution (cache disabled - causing overhead)
            for (let i = 0; i < uniqueImports.length; i += batchSize) {
                const batch = uniqueImports.slice(i, i + batchSize);
                const batchResults = await Promise.all(
                    batch.map(async (imp) => {
                        try {
                            const resolved =
                                this.languageParser!.resolveImportWithCache(
                                    imp,
                                    [],
                                    filePath,
                                );
                            return resolved?.normalizedPath || imp;
                        } catch (err) {
                            console.error(
                                `[PERFORMANCE] Import resolution failed for ${imp}:`,
                                err,
                            );
                            return imp;
                        }
                    }),
                );
                normalizedImports.push(...batchResults);
            }

            return {
                fileAnalysis: {
                    defines: Array.from(context.fileDefines),
                    calls: context.fileCalls,
                    imports: normalizedImports,
                    className: Array.from(context.fileClassNames),
                    nodes: context.analysisNodes,
                },
                functions: context.functions,
                types: context.types,
            };
        } catch (error) {
            console.error(`Error analyzing file ${filePath}:`, error);
            return this.emptyAnalysis();
        }
    }

    private async readFileContent(filePath: string): Promise<string | null> {
        try {
            await fs.promises.access(filePath, fs.constants.R_OK);

            return await fs.promises.readFile(filePath, 'utf-8');
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    private emptyAnalysis(): ParserAnalysis {
        return {
            fileAnalysis: {
                defines: [],
                calls: [],
                imports: [],
                className: [],
                nodes: new Map(),
            },
            functions: new Map(),
            types: new Map(),
        };
    }

    private async initializeImportResolver(rootDir: string): Promise<void> {
        const resolver = await getLanguageResolver(rootDir);
        if (!resolver) {
            return;
        }
        this.importPathResolver = resolver;
        await resolver.initialize();
    }
}
