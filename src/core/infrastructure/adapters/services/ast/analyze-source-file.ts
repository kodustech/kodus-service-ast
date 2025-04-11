import {
    Call,
    FileAnalysis,
    FunctionAnalysis,
    TypeAnalysis,
} from '@/core/domain/ast/contracts/CodeGraph';
import * as fs from 'fs';
import { ResolverFactory } from './resolvers/ResolverFactory';
import { ImportPathResolverService } from './import-path-resolver.service';
import { getParserByFilePath } from './parsers';
import { BaseParser } from './parsers/base-parser';
import { ParserAnalysis } from '@/core/domain/ast/contracts/Parser';

export class SourceFileAnalyzer {
    private importPathResolver: ImportPathResolverService =
        new ImportPathResolverService();
    private resolverFactory: ResolverFactory = new ResolverFactory();

    private languageParser: BaseParser | null = null;

    async analyzeSourceFile(
        rootDir: string,
        filePath: string,
        absolutePath: string,
    ): Promise<ParserAnalysis> {
        try {
            await this.initializeImportResolver(rootDir);

            const content = await this.readFileContent(filePath);
            if (!content) {
                return this.emptyAnalysis();
            }

            const fileStats = await fs.promises.stat(filePath);
            const fileSizeInMB = fileStats?.size / (1024 * 1024);
            if (fileSizeInMB > 5) {
                console.warn(
                    `Arquivo muito grande para análise (${fileSizeInMB.toFixed(2)}MB): ${filePath}`,
                );
                return this.emptyAnalysis();
            }

            const context = {
                fileDefines: new Set<string>(),
                fileImports: new Set<string>(),
                fileClassNames: new Set<string>(),
                functions: new Map<string, FunctionAnalysis>(),
                fileCalls: [] as Call[],
                importedMapping: new Map<string, string>(),
                instanceMapping: new Map<string, string>(),
                types: new Map<string, TypeAnalysis>(),
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

            await this.languageParser.collectAllInOnePass(
                syntaxTree.rootNode,
                filePath,
                absolutePath,
            );

            this.languageParser.collectFunctionDetailsWithQuery(
                syntaxTree.rootNode,
                absolutePath,
            );

            this.languageParser.collectTypeDetailsUsingQuery(
                syntaxTree.rootNode,
                absolutePath,
            );

            const uniqueImports = Array.from(context.fileImports);
            const batchSize = 10;
            const normalizedImports: string[] = [];

            for (let i = 0; i < uniqueImports.length; i += batchSize) {
                const batch = uniqueImports.slice(i, i + batchSize);
                const batchResults = await Promise.all(
                    batch.map((imp) => {
                        try {
                            const resolved =
                                this.languageParser.resolveImportWithCache(
                                    imp,
                                    filePath,
                                );
                            return resolved?.normalizedPath || imp;
                        } catch (err) {
                            console.error(err);
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
                },
                functions: context.functions,
                types: context.types,
            };
        } catch (error) {
            console.error(`Erro ao analisar arquivo ${filePath}:`, error);
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

    private emptyAnalysis(): {
        fileAnalysis: FileAnalysis;
        functions: Map<string, FunctionAnalysis>;
        types: Map<string, TypeAnalysis>;
    } {
        return {
            fileAnalysis: { defines: [], calls: [], imports: [] },
            functions: new Map(),
            types: new Map(),
        };
    }

    private async initializeImportResolver(rootDir: string): Promise<void> {
        const resolver = await this.resolverFactory.getResolver(rootDir);
        this.importPathResolver.initialize(rootDir, resolver);
    }
}
