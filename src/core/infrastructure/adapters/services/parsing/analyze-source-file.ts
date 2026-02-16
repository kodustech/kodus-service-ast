import { type LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract.js';
import {
    type ParseContext,
    type ParserAnalysis,
} from '@/core/domain/parsing/types/parser.js';
import {
    type AnalysisNode,
    type Call,
    type FunctionAnalysis,
    type TypeAnalysis,
} from '@/shared/types/ast.js';
import { type BaseParser } from './parsers/base-parser.js';
import { getParserByFilePath } from './parsers/index.js';
import { NoOpResolver } from './resolvers/noop-resolver.js';

export class SourceFileAnalyzer {
    private importPathResolver: LanguageResolver | null = null;
    private languageParser: BaseParser | null = null;

    async analyzeSourceFile(
        filePath: string,
        absolutePath: string,
        inputContent: string,
    ): Promise<ParserAnalysis> {
        try {
            this.importPathResolver = new NoOpResolver();

            const content = inputContent;
            const fileSizeInMB =
                Buffer.byteLength(content, 'utf8') / (1024 * 1024);
            if (fileSizeInMB > 5) {
                console.warn(
                    `Content too large for analysis (${fileSizeInMB.toFixed(2)}MB): ${filePath}`,
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

            if (syntaxTree.rootNode.hasError) {
                console.warn(`Syntax errors found in ${filePath}`);
                return this.emptyAnalysis();
            }

            this.languageParser.collectAllInOnePass(
                syntaxTree.rootNode,
                filePath,
                absolutePath,
            );

            const imports = Array.from(context.fileImports);

            return {
                fileAnalysis: {
                    defines: Array.from(context.fileDefines),
                    calls: context.fileCalls,
                    imports,
                    className: Array.from(context.fileClassNames),
                    nodes: context.analysisNodes,
                },
                functions: context.functions,
                types: context.types,
            };
        } catch (error) {
            // Note: This is a utility class, not a NestJS service
            // For now, we'll use console.error as fallback since we don't have logger injection here
            // TODO: Consider refactoring to accept logger as parameter or use a global logger
            console.error(`Error analyzing file ${filePath}:`, error);
            return this.emptyAnalysis();
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
}
