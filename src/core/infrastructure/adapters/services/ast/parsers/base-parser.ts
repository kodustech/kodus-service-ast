import * as Parser from 'tree-sitter';
import { QueryCapture, SyntaxNode } from 'tree-sitter';
import { Language } from 'tree-sitter';
import { ImportPathResolverService } from '../import-path-resolver.service';
import { ResolvedImport } from '@/core/domain/ast/contracts/ImportPathResolver';
import { ParseContext } from '@/core/domain/ast/contracts/Parser';
import {
    CaptureNamesForType,
    EnhancedQuery,
    ParserQuery,
    QueryType,
} from './query';

export abstract class BaseParser {
    private importCache: Map<string, ResolvedImport> = new Map();
    private importPathResolver: ImportPathResolverService;

    protected parser: Parser;
    protected language: Language;
    protected queries: Map<QueryType, ParserQuery>;

    protected context: ParseContext;

    constructor(
        importPathResolver: ImportPathResolverService,
        context: ParseContext,
    ) {
        this.setupLanguage();
        this.setupParser();
        this.setupQueries();
        this.importPathResolver = importPathResolver;
        this.context = context;
    }

    protected abstract setupLanguage(): void;
    protected abstract setupQueries(): void;

    private setupParser(): void {
        if (this.parser) {
            return;
        }

        if (!this.language) {
            throw new Error('Language not set up');
        }

        const parser = new Parser();
        parser.setLanguage(this.language);
        this.parser = parser;
    }

    public getParser(): Parser {
        if (!this.parser) {
            throw new Error('Parser not set up');
        }
        return this.parser;
    }

    public getLanguage(): Language {
        if (!this.language) {
            throw new Error('Language not set up');
        }
        return this.language;
    }

    public getQuery<T extends QueryType>(
        type: T,
    ): Extract<ParserQuery, { type: T }> {
        if (!this.queries) {
            throw new Error('Queries not set up');
        }
        const query = this.queries.get(type);
        if (!query) {
            throw new Error(`Query not found for type: ${type}`);
        }
        return query as Extract<ParserQuery, { type: T }>;
    }

    protected newQueryFromType<T extends QueryType>(
        queryType: T,
    ): EnhancedQuery<T> {
        const parserQuery = this.getQuery(queryType);
        return this.newQuery(parserQuery);
    }

    protected newQuery<T extends QueryType>(
        query: Extract<ParserQuery, { type: T }>,
    ): EnhancedQuery<T> {
        return new EnhancedQuery(
            this.language,
            query.query,
            query.captureNames as CaptureNamesForType<T>,
        );
    }

    public collectAllInOnePass(
        rootNode: SyntaxNode,
        filePath: string,
        absolutePath: string,
    ): Promise<void> {
        const parserQuery = this.getQuery(QueryType.MAIN_QUERY);
        if (!parserQuery || !parserQuery.query || !parserQuery.captureNames) {
            throw new Error('Main query not found');
        }

        const query = this.newQuery(parserQuery);
        const captures = query.captures(rootNode);

        const importCaptures: QueryCapture[] = [];
        const definitionCaptures: QueryCapture[] = [];
        const callCaptures: QueryCapture[] = [];

        for (const capture of captures) {
            if (!capture || !capture.name) {
                continue;
            }

            if (parserQuery.captureNames.import.includes(capture.name)) {
                importCaptures.push(capture);
            } else if (
                parserQuery.captureNames.definition.includes(capture.name)
            ) {
                definitionCaptures.push(capture);
            } else if (parserQuery.captureNames.call.includes(capture.name)) {
                callCaptures.push(capture);
            }
        }

        importCaptures.forEach((capture) => {
            this.processImportCapture(capture, filePath);
        });

        definitionCaptures.forEach((capture) => {
            this.processDefinitionCapture(capture, absolutePath);
        });

        callCaptures.forEach((capture) => {
            this.processCallCapture(capture, absolutePath);
        });

        // legacy, original typescript was async
        return Promise.resolve();
    }

    protected abstract processImportCapture(
        capture: QueryCapture,
        filePath: string,
    ): void;
    protected abstract processDefinitionCapture(
        capture: QueryCapture,
        absolutePath: string,
    ): void;
    protected abstract processCallCapture(
        capture: QueryCapture,
        absolutePath: string,
    ): void;

    public abstract collectFunctionDetailsWithQuery(
        rootNode: SyntaxNode,
        absolutePath: string,
    ): void;

    public abstract collectTypeDetailsUsingQuery(
        rootNode: SyntaxNode,
        absolutePath: string,
    ): void;

    public resolveImportWithCache(
        importPath: string,
        filePath: string,
    ): ResolvedImport {
        const cacheKey = `${importPath}:${filePath}`;
        if (this.importCache.has(cacheKey)) {
            return this.importCache.get(cacheKey);
        }

        const resolved = this.importPathResolver.resolveImport(
            importPath,
            filePath,
        );
        this.importCache.set(cacheKey, resolved);
        return resolved;
    }

    protected extractTokensFromNode(node: SyntaxNode): string[] {
        return node.text.match(/\b[\w$]+\b/g) || [];
    }

    protected normalizeSignatureText(original: string): string {
        return original.replace(/\s+/g, ' ').trim();
    }
}
