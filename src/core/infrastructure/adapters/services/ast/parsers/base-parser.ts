import * as Parser from 'tree-sitter';
import { Query, QueryCapture, QueryMatch, SyntaxNode } from 'tree-sitter';
import { Language } from 'tree-sitter';
import { ImportPathResolverService } from '../import-path-resolver.service';
import { ResolvedImport } from '@/core/domain/ast/contracts/ImportPathResolver';
import { ParseContext } from '@/core/domain/ast/contracts/Parser';
import { ParserQuery, QueryType } from './query';
import {
    Call,
    Scope,
    ScopeType,
    TypeAnalysis,
} from '@/core/domain/ast/contracts/CodeGraph';
import { normalizeAST, normalizeSignature } from '@/shared/utils/ast-helpers';

type Method = {
    name: string;
    params: MethodParameter[];
    returnType: string | null;
    bodyNode: SyntaxNode | null;
    scope: Scope[];
};

type MethodParameter = {
    name: string;
    type: string | null;
};

type ObjectProperties = {
    properties: ObjectProperty[];
    type: string | null;
};

type ObjectProperty = {
    name: string;
    type: string | null;
    value: string | null;
};

export abstract class BaseParser {
    private importCache: Map<string, ResolvedImport> = new Map();
    private importPathResolver: ImportPathResolverService;
    private parser: Parser;
    private context: ParseContext;

    protected language: Language;
    protected queries: Map<QueryType, ParserQuery>;
    protected constructorName: string;
    protected selfAccessReference: string;

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

    protected abstract getMemberChain(node: SyntaxNode): string[];
    protected abstract getScopeChain(node: SyntaxNode): Scope[];

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

    public getQuery(type: QueryType): ParserQuery | null {
        if (!this.queries) {
            throw new Error('Queries not set up');
        }
        const query = this.queries.get(type);
        if (!query) {
            return null;
        }
        return query;
    }

    protected newQueryFromType(queryType: QueryType): Query | null {
        const parserQuery = this.getQuery(queryType);
        if (!parserQuery) {
            return null;
        }
        return this.newQuery(parserQuery);
    }

    protected newQuery(query: ParserQuery): Query {
        const mainQuery = new Query(this.language, query.query);

        return mainQuery;
    }

    public collectAllInOnePass(
        rootNode: SyntaxNode,
        filePath: string,
        absolutePath: string,
    ): Promise<void> {
        this.collectImports(rootNode, filePath);

        const objTypes = [
            QueryType.CLASS_QUERY,
            QueryType.INTERFACE_QUERY,
            QueryType.ENUM_QUERY,
        ] as const;

        objTypes.forEach((type) =>
            this.collectObjDeclarations(rootNode, absolutePath, type),
        );

        this.collectFunctionDetails(rootNode, absolutePath);

        // legacy, original typescript was async
        return Promise.resolve();
    }

    public collectImports(rootNode: SyntaxNode, filePath: string): void {
        const query = this.newQueryFromType(QueryType.IMPORT_QUERY);
        if (!query) return;

        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        for (const match of matches) {
            const captures = match.captures;
            // captures come in order so we can safely assume the first one is the origin
            const origin = captures[0];
            if (!origin) continue;

            const originName = this.getOriginName(origin);
            if (!originName) continue;

            const imported = this.parseImportedSymbols(captures);
            const resolvedImport = this.resolveImportWithCache(
                originName,
                filePath,
            );
            if (!resolvedImport) continue;

            const normalizedPath = resolvedImport.normalizedPath || originName;
            this.context.fileImports.add(normalizedPath);

            this.registerImportedSymbols(imported, normalizedPath);
        }
    }

    private getOriginName(origin: QueryCapture): string | null {
        switch (origin.name) {
            case 'auxiliary':
                return this.processImportAuxiliary(origin.node);
            case 'origin':
                return origin.node.text;
            default:
                return null;
        }
    }

    private parseImportedSymbols(
        captures: QueryCapture[],
    ): { symbol: string; alias: string | null }[] {
        const imported: { symbol: string; alias: string | null }[] = [];

        for (const capture of captures) {
            const captureName = capture.name;
            const nodeText = capture.node.text;

            if (captureName === 'symbol') {
                imported.push({ symbol: nodeText, alias: null });
            }

            if (captureName === 'alias' && imported.length > 0) {
                imported[imported.length - 1].alias = nodeText;
            }
        }

        if (imported.length === 0) {
            imported.push({ symbol: '*', alias: null });
        }

        return imported;
    }

    private registerImportedSymbols(
        imported: { symbol: string; alias: string | null }[],
        normalizedPath: string,
    ): void {
        for (const { symbol: name, alias } of imported) {
            this.context.importedMapping.set(name, normalizedPath);
            if (alias) {
                this.context.importedMapping.set(alias, name);
            }
        }
    }

    protected processImportAuxiliary(aux: SyntaxNode): string | null {
        const query = this.newQueryFromType(QueryType.IMPORT_AUXILIARY_QUERY);
        const matches = query.matches(aux);
        if (matches.length === 0) return null;

        // queries are ordered by priority, so we can take the first one
        // even if there are multiple matches
        const captures = matches[0].captures;
        if (captures.length === 0) return null;

        const origin = captures.find((capture) => capture.name === 'origin');
        const isBinaryExpr = captures.find(
            (capture) => capture.name === 'fname' || capture.name === 'dir',
        );

        if (!origin) return null;
        const path = isBinaryExpr
            ? origin.node.text.slice(1) // remove leading slash
            : origin.node.text;

        return path;
    }

    private getObjTypeFromQueryType(type: QueryType): string | null {
        switch (type) {
            case QueryType.CLASS_QUERY:
                return 'class';
            case QueryType.INTERFACE_QUERY:
                return 'interface';
            case QueryType.ENUM_QUERY:
                return 'enum';
            default:
                return null;
        }
    }

    public collectObjDeclarations(
        rootNode: SyntaxNode,
        absolutePath: string,
        type: QueryType,
    ): void {
        const query = this.newQueryFromType(type);
        if (!query) return;

        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        const objType = this.getObjTypeFromQueryType(type);
        if (!objType) return;

        for (const match of matches) {
            const objAnalysis = this.processObjMatch(
                match,
                absolutePath,
                objType,
            );
            this.storeObjectAnalysis(objAnalysis, absolutePath);
        }
    }

    private storeObjectAnalysis(
        objAnalysis: TypeAnalysis,
        absolutePath: string,
    ): void {
        const key = `${absolutePath}::${this.scopeToString(objAnalysis.scope)}`;
        const existingObj = this.context.types.get(key);

        if (existingObj) {
            this.mergeObjectAnalyses(existingObj, objAnalysis);
        } else {
            this.context.types.set(key, objAnalysis);
        }

        this.context.fileClassNames.add(objAnalysis.name);
        this.context.fileDefines.add(objAnalysis.name);
    }

    private mergeObjectAnalyses(
        target: TypeAnalysis,
        source: TypeAnalysis,
    ): void {
        target.extends = [...(target.extends || []), ...(source.extends || [])];
        target.implements = [
            ...(target.implements || []),
            ...(source.implements || []),
        ];
        target.fields = { ...target.fields, ...source.fields };
    }

    private processObjMatch(
        match: QueryMatch,
        absolutePath: string,
        type: string,
    ): TypeAnalysis {
        const objAnalysis: TypeAnalysis = {
            name: '',
            extends: [],
            implements: [],
            fields: {},
            file: absolutePath,
            type,
        };

        const methods: Method[] = [];
        const properties: ObjectProperties = {
            properties: [],
            type: null,
        };

        for (const capture of match.captures) {
            this.processObjCapture(capture, objAnalysis, methods, properties);
        }

        this.processMethods(objAnalysis, methods);
        this.processProperties(objAnalysis, properties);
        this.processConstructor(objAnalysis, methods);

        return objAnalysis;
    }

    private processObjCapture(
        capture: QueryCapture,
        objAnalysis: TypeAnalysis,
        methods: Method[],
        objProps: ObjectProperties,
    ): void {
        const text = capture.node?.text;
        if (!text) {
            return;
        }

        const lastMethod = methods[methods.length - 1];

        switch (capture.name) {
            case 'objName': {
                const scopeChain = this.getScopeChain(capture.node);
                objAnalysis.name = text;
                objAnalysis.scope = scopeChain;
                break;
            }
            case 'objExtends': {
                this.addObjExtension(objAnalysis, text);
                break;
            }
            case 'objImplements': {
                this.addObjImplementation(objAnalysis, text);
                break;
            }
            case 'objMethod': {
                this.addNewMethod(methods, text);
                break;
            }
            case 'funcParamName': {
                this.addMethodParameter(lastMethod, {
                    name: text,
                });
                break;
            }
            case 'funcParamType': {
                this.addMethodParameter(lastMethod, {
                    type: text,
                });
                break;
            }
            case 'objMethodReturnType': {
                this.setMethodReturnType(lastMethod, text);
                break;
            }
            case 'objProperty': {
                this.addObjProperty(objProps.properties, {
                    name: text,
                });
                break;
            }
            case 'objPropertyType': {
                this.addObjProperty(objProps.properties, {
                    type: text,
                });
                break;
            }
            case 'objPropertyValue': {
                this.addObjProperty(objProps.properties, {
                    value: text,
                });
                break;
            }
            case 'enumType': {
                objProps.type = text;
                break;
            }
        }
    }

    private addObjExtension(
        objAnalysis: TypeAnalysis,
        extension: string,
    ): void {
        if (!objAnalysis.extends) {
            objAnalysis.extends = [];
        }
        objAnalysis.extends.push(extension);
    }

    private addObjImplementation(
        objAnalysis: TypeAnalysis,
        implementation: string,
    ): void {
        if (!objAnalysis.implements) {
            objAnalysis.implements = [];
        }
        objAnalysis.implements.push(implementation);
    }

    private addNewMethod(methods: Method[], methodName: string): void {
        methods.push({
            name: methodName,
            params: [],
            returnType: null,
            bodyNode: null,
            scope: [],
        });
    }

    private addMethodParameter(
        method: Method,
        newMethod: Partial<MethodParameter>,
    ): void {
        if (!method) return;

        const lastParam = method.params[method.params.length - 1];
        if (lastParam && !lastParam.name) {
            if (newMethod.name) {
                lastParam.name = newMethod.name;
            }
            if (newMethod.type && !lastParam.type) {
                lastParam.type = newMethod.type;
            }
        } else {
            method.params.push({
                name: newMethod.name || null,
                type: newMethod.type || null,
            });
        }
    }

    private setMethodReturnType(method: Method, returnType: string): void {
        if (!method) return;
        method.returnType = returnType;
    }

    private addObjProperty(
        properties: ObjectProperty[],
        newProperty: Partial<ObjectProperty>,
    ): void {
        const lastProperty = properties[properties.length - 1];

        if (lastProperty && !lastProperty.name) {
            if (newProperty.name) {
                lastProperty.name = newProperty.name;
            }
            if (newProperty.type && !lastProperty.type) {
                lastProperty.type = newProperty.type;
            }
            if (newProperty.value && !lastProperty.value) {
                lastProperty.value = newProperty.value;
            }
        } else {
            properties.push({
                name: newProperty.name || null,
                type: newProperty.type || null,
                value: newProperty.value || null,
            });
        }
    }

    private processMethods(objAnalysis: TypeAnalysis, methods: Method[]): void {
        if (!objAnalysis.fields) {
            objAnalysis.fields = {};
        }

        for (const method of methods.filter((m) => m.name)) {
            const filteredParams = method.params.filter((param) => param.name);

            const params = `(${filteredParams
                .map((param) => param.name)
                .join(', ')})`;
            const methodSignature = `${params}:${method.returnType || 'unknown'}`;
            objAnalysis.fields[method.name] = methodSignature;
        }
    }

    private processProperties(
        objAnalysis: TypeAnalysis,
        objProps: ObjectProperties,
    ): void {
        if (!objAnalysis.fields) {
            objAnalysis.fields = {};
        }

        for (const property of objProps.properties) {
            if (!property.name) continue;
            objAnalysis.fields[property.name] =
                property.type || objProps.type || 'unknown';
        }
    }

    private processConstructor(
        objAnalysis: TypeAnalysis,
        methods: Method[],
    ): void {
        const constructor = methods.find(
            (method) => method.name === this.constructorName,
        );
        if (!constructor) return;

        for (const param of constructor.params) {
            if (param.name && param.type && objAnalysis.scope) {
                const fullName = `${this.scopeToString(objAnalysis.scope)}::${param.name}`;
                const fullType = `${this.scopeToString(objAnalysis.scope)}::${param.type}`;

                this.context.instanceMapping.set(fullName, fullType);
                this.context.instanceMapping.set(fullType, fullName);
            }
        }
    }

    public collectFunctionDetails(
        rootNode: SyntaxNode,
        absolutePath: string,
    ): void {
        const query = this.newQueryFromType(QueryType.FUNCTION_QUERY);
        if (!query) return;

        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        for (const match of matches) {
            const captures = match.captures;
            if (captures.length === 0) continue;

            const method: Method = {
                name: '',
                params: [],
                returnType: null,
                bodyNode: null,
                scope: [],
            };
            captures.forEach((capture) =>
                this.processFunctionCapture(capture, method),
            );
            if (!method.name) continue;

            const key = `${absolutePath}::${this.scopeToString(method.scope)}`;

            let calls: Call[] = [];
            if (method.bodyNode) {
                calls = this.collectFunctionCalls(
                    method.bodyNode,
                    absolutePath,
                );
            }

            const params = method.params.map((param) => param.name);
            const returnType = method.returnType || 'unknown';
            const normalizedBody = normalizeAST(method.bodyNode);
            const signatureHash = normalizeSignature(params, returnType);
            const lines = method.bodyNode
                ? method.bodyNode.endPosition.row -
                  method.bodyNode.startPosition.row +
                  1
                : 0;
            const className =
                method.scope.find((scope) => scope.type === ScopeType.CLASS)
                    ?.name || '';

            this.context.functions.set(key, {
                file: absolutePath,
                name: method.name,
                params,
                lines,
                returnType,
                calls,
                className,
                startLine: method.bodyNode?.startPosition.row + 1 || 0,
                endLine: method.bodyNode?.endPosition.row + 1 || 0,
                functionHash: normalizedBody,
                signatureHash,
                fullText: method.bodyNode?.text || '',
            });
        }
    }

    private processFunctionCapture(
        capture: QueryCapture,
        method: Method,
    ): void {
        const node = capture.node;
        if (!node) return;

        switch (capture.name) {
            case 'funcName': {
                const scopeChain = this.getScopeChain(node);
                method.name = node.text;
                method.scope = scopeChain;
                break;
            }
            case 'funcParamName': {
                this.addMethodParameter(method, {
                    name: node.text,
                });
                break;
            }
            case 'funcParamType': {
                this.addMethodParameter(method, {
                    type: node.text,
                });
                break;
            }
            case 'funcReturnType': {
                this.setMethodReturnType(method, node.text);
                break;
            }
            case 'funcBody': {
                method.bodyNode = node;
                break;
            }
        }
    }

    private collectFunctionCalls(
        rootNode: SyntaxNode,
        absolutePath: string,
    ): Call[] {
        const query = this.newQueryFromType(QueryType.FUNCTION_CALL_QUERY);
        if (!query) return;

        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        const calls: Call[] = [];

        for (const match of matches) {
            const captures = match.captures;
            if (captures.length === 0) continue;

            for (const capture of captures) {
                const node = capture.node;
                if (!node) return;

                const chain = this.getMemberChain(node);
                let instanceName: string | undefined;
                let targetFile = absolutePath;

                if (
                    chain.length >= 3 &&
                    chain[0] === this.selfAccessReference
                ) {
                    instanceName = chain[1];
                } else if (chain.length >= 2) {
                    instanceName = chain[0];
                } else if (chain.length === 1) {
                    instanceName = chain[0];
                }

                if (instanceName) {
                    let typeName =
                        this.context.instanceMapping.get(instanceName);
                    if (!typeName) {
                        typeName = instanceName;
                    }

                    const importedFile =
                        this.context.importedMapping.get(typeName);
                    if (importedFile) {
                        targetFile = importedFile;
                    }
                }

                calls.push({
                    function: chain.pop() || '',
                    file: targetFile,
                    caller: instanceName || '',
                });
            }
        }

        return calls;
    }

    private scopeToString(scope: Scope[]): string {
        return scope.map((s) => s.name).join('::');
    }

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
