import * as Parser from 'tree-sitter';
import { Query, QueryCapture, QueryMatch, SyntaxNode } from 'tree-sitter';
import { Language } from 'tree-sitter';
import { ImportPathResolverService } from '../import-path-resolver.service';
import { ResolvedImport } from '@/core/domain/ast/contracts/ImportPathResolver';
import { ParseContext } from '@/core/domain/ast/contracts/Parser';
import { objQueries, ParserQuery, QueryType } from './query';
import {
    Call,
    Scope,
    ScopeType,
    TypeAnalysis,
} from '@/core/domain/ast/contracts/CodeGraph';
import { normalizeAST, normalizeSignature } from '@/shared/utils/ast-helpers';
import { findLastIndexOf } from '@/shared/utils/arrays';

export type Method = {
    name: string;
    params: MethodParameter[];
    returnType: string | null;
    bodyNode: SyntaxNode | null;
    scope: Scope[];
};

export type MethodParameter = {
    name: string;
    type: string | null;
};

export type ObjectProperties = {
    properties: ObjectProperty[];
    type: string | null;
};

export type ObjectProperty = {
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
    protected abstract queries: Map<QueryType, ParserQuery>;

    protected abstract constructorName: string;
    protected abstract selfAccessReference: string;
    protected abstract scopes: Map<string, ScopeType>;
    protected abstract rootNodeType: string;

    protected abstract memberChainNodeTypes: {
        callNodeTypes: string[];
        memberNodeTypes: string[];
        functionNameFields: string[];
        instanceNameTypes: string[];
        functionChildFields: string[];
    };

    constructor(
        importPathResolver: ImportPathResolverService,
        context: ParseContext,
    ) {
        this.setupLanguage();
        this.setupParser();

        this.importPathResolver = importPathResolver;
        this.context = context;
    }

    protected abstract setupLanguage(): void;

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

    protected getQuery(type: QueryType): ParserQuery | null {
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
    ): void {
        this.collectImports(rootNode, filePath);

        this.collectTypeAliases(rootNode, absolutePath);

        objQueries.forEach((type) =>
            this.collectObjDeclarations(rootNode, absolutePath, type),
        );

        this.collectFunctionDetails(rootNode, absolutePath);
    }

    protected collectImports(rootNode: SyntaxNode, filePath: string): void {
        const query = this.newQueryFromType(QueryType.IMPORT_QUERY);
        if (!query) return;

        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        for (const match of matches) {
            const captures = match.captures;

            const origin = captures.find(
                (capture) => capture.name === 'origin',
            );
            if (!origin) continue;

            let originName = origin.node.text;
            if (match['properties']) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const properties = match['properties'];
                if (
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    properties['leadingSlash'] &&
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    properties['leadingSlash'] === 'true'
                ) {
                    originName = originName.replace(/^\//, '');
                }
            }

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

    protected parseImportedSymbols(
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
            let alias: string | null = null;
            const aliasCapture = captures.find(
                (capture) => capture.name === 'alias',
            );
            if (aliasCapture) {
                alias = aliasCapture.node.text;
            }
            imported.push({ symbol: '*', alias });
        }

        return imported;
    }

    protected registerImportedSymbols(
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

    protected collectObjDeclarations(
        rootNode: SyntaxNode,
        absolutePath: string,
        type: QueryType,
    ): void {
        const query = this.newQueryFromType(type);
        if (!query) return;

        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        for (const match of matches) {
            const objAnalysis = this.processObjMatch(match, absolutePath, type);
            this.storeObjectAnalysis(objAnalysis, absolutePath);
        }
    }

    protected storeObjectAnalysis(
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

    protected mergeObjectAnalyses(
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

    protected processObjMatch(
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

    protected processObjCapture(
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
            default: {
                this.processExtraObjCapture(
                    capture,
                    objAnalysis,
                    methods,
                    objProps,
                );
                break;
            }
        }
    }

    /* eslint-disable @typescript-eslint/no-unused-vars */
    /**
     * override this method to process extra captures that are not handled by the default implementation.
     */
    protected processExtraObjCapture(
        capture: QueryCapture,
        objAnalysis: TypeAnalysis,
        methods: Method[],
        objProps: ObjectProperties,
    ): void {
        return; // No extra processing needed generally
    }
    /* eslint-enable @typescript-eslint/no-unused-vars */

    protected addObjExtension(
        objAnalysis: TypeAnalysis,
        extension: string,
    ): void {
        if (!objAnalysis.extends) {
            objAnalysis.extends = [];
        }
        const mapped = this.context.importedMapping.get(extension);
        let key: string;
        if (mapped) {
            key = `${mapped}::${extension}`;
        } else {
            key = `${objAnalysis.file}::${extension}`;
        }

        objAnalysis.extends.push(key);
    }

    protected addObjImplementation(
        objAnalysis: TypeAnalysis,
        implementation: string,
    ): void {
        if (!objAnalysis.implements) {
            objAnalysis.implements = [];
        }
        const mapped = this.context.importedMapping.get(implementation);
        let key: string;
        if (mapped) {
            key = `${mapped}::${implementation}`;
        } else {
            key = `${objAnalysis.file}::${implementation}`;
        }

        objAnalysis.implements.push(key);
    }

    protected addNewMethod(methods: Method[], methodName: string): void {
        methods.push({
            name: methodName,
            params: [],
            returnType: null,
            bodyNode: null,
            scope: [],
        });
    }

    protected addMethodParameter(
        method: Method,
        newInfo: Partial<MethodParameter>,
    ): void {
        const last = method.params[method.params.length - 1];

        const needsNew =
            !last || // no params yet
            (newInfo.name && last.name !== null) || // a new name seen
            (newInfo.type && last.type !== null); // a new type seen

        if (needsNew) {
            method.params.push({ name: null, type: null });
        }

        const current = method.params[method.params.length - 1];

        if (newInfo.name !== undefined) current.name = newInfo.name;
        if (newInfo.type !== undefined) current.type = newInfo.type;
    }

    protected setMethodReturnType(method: Method, returnType: string): void {
        if (!method) return;
        method.returnType = returnType;
    }

    protected addObjProperty(
        properties: ObjectProperty[],
        newInfo: Partial<ObjectProperty>,
    ): void {
        const last = properties[properties.length - 1];

        const needsNew =
            !last || // no properties yet
            (newInfo.name && last.name !== null) || // a new name seen
            (newInfo.type && last.type !== null) || // a new type seen
            (newInfo.value && last.value !== null); // a new value seen

        if (needsNew) {
            properties.push({ name: null, type: null, value: null });
        }

        const current = properties[properties.length - 1];

        if (newInfo.name !== undefined) current.name = newInfo.name;
        if (newInfo.type !== undefined) current.type = newInfo.type;
        if (newInfo.value !== undefined) current.value = newInfo.value;
    }

    protected processMethods(
        objAnalysis: TypeAnalysis,
        methods: Method[],
    ): void {
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

            this.context.fileDefines.add(method.name);
        }
    }

    protected processProperties(
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

    protected processConstructor(
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

    protected collectFunctionDetails(
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
                    method.scope,
                );

                this.context.fileCalls.push(...calls);
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
                method.scope
                    .reverse()
                    .find((scope) => scope.type === ScopeType.CLASS)?.name ||
                method.scope
                    .reverse()
                    .find((scope) =>
                        [ScopeType.ENUM, ScopeType.INTERFACE].includes(
                            scope.type,
                        ),
                    )?.name ||
                '';

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

    protected processFunctionCapture(
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

    protected collectFunctionCalls(
        rootNode: SyntaxNode,
        absolutePath: string,
        scope: Scope[],
    ): Call[] {
        const query = this.newQueryFromType(QueryType.FUNCTION_CALL_QUERY);
        if (!query) return [];

        const matches = query.matches(rootNode);
        if (matches.length === 0) return [];

        const calls: Call[] = [];

        for (const match of matches) {
            const captures = match.captures;
            if (captures.length === 0) continue;

            for (const capture of captures) {
                const node = capture.node;
                if (!node) break;

                const chain = this.getMemberChain(node);
                if (!chain || chain.length === 0) continue;

                let currentCaller = chain.find((c) => c.type === 'member');

                if (!currentCaller) {
                    for (const { name } of chain) {
                        const targetFile = this.resolveTargetFile(
                            name,
                            absolutePath,
                            scope,
                        );
                        calls.push({
                            function: name,
                            file: targetFile,
                            caller: this.selfAccessReference,
                        });
                    }
                } else {
                    let targetFile = absolutePath;

                    if (currentCaller.name !== this.selfAccessReference) {
                        targetFile = this.resolveTargetFile(
                            currentCaller.name,
                            absolutePath,
                            scope,
                        );
                    }

                    for (const { name, type } of chain) {
                        if (type === 'function') {
                            calls.push({
                                function: name,
                                file: targetFile,
                                caller: currentCaller.name,
                            });
                        }

                        currentCaller = { name, type };
                        targetFile = this.resolveTargetFile(
                            currentCaller.name,
                            absolutePath,
                            scope,
                        );
                    }
                }
            }
        }

        return calls;
    }

    protected collectTypeAliases(
        rootNode: SyntaxNode,
        absolutePath: string,
    ): void {
        const query = this.newQueryFromType(QueryType.TYPE_ALIAS_QUERY);
        if (!query) return;

        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        for (const match of matches) {
            const captures = match.captures;
            if (captures.length === 0) continue;

            const typeAnalysis: TypeAnalysis = {
                name: '',
                extends: [],
                implements: [],
                fields: {},
                file: absolutePath,
                type: QueryType.TYPE_ALIAS_QUERY,
            };

            for (const capture of captures) {
                const node = capture.node;
                if (!node) continue;

                const typeFields = [] as string[];

                switch (capture.name) {
                    case 'typeName': {
                        const scopeChain = this.getScopeChain(node);
                        typeAnalysis.name = node.text;
                        typeAnalysis.scope = scopeChain;
                        break;
                    }
                    case 'typeField': {
                        typeFields.push(node.text);
                        break;
                    }
                    case 'typeValue': {
                        const typeName = node.text;
                        if (typeFields.length > 0) {
                            typeAnalysis.fields[typeFields.pop() || ''] =
                                typeName;
                        } else {
                            typeAnalysis.fields[typeName] = typeName;
                        }
                        break;
                    }
                }
            }

            const key = `${absolutePath}::${this.scopeToString(
                typeAnalysis.scope,
            )}`;

            const existingType = this.context.types.get(key);
            if (existingType) {
                this.mergeObjectAnalyses(existingType, typeAnalysis);
            }

            this.context.types.set(key, typeAnalysis);
            this.context.fileDefines.add(typeAnalysis.name);
        }
    }

    protected getScopeChain(node: SyntaxNode): Scope[] {
        const chain: Scope[] = [];
        let currentNode: SyntaxNode | null = node;

        while (currentNode && currentNode.type !== this.rootNodeType) {
            const scopeType = this.scopes.get(currentNode.type);
            if (scopeType) {
                const nameNode = currentNode.childForFieldName('name');
                if (nameNode) {
                    const name = nameNode.text;
                    chain.unshift({
                        type: scopeType,
                        name: name,
                    });
                } else {
                    const assignment = currentNode.childForFieldName('left');
                    if (assignment) {
                        const name = assignment.text;
                        chain.unshift({
                            type: scopeType,
                            name: name,
                        });
                    }
                }
            }
            currentNode = currentNode.parent;
        }

        return chain;
    }

    protected getMemberChain(node: SyntaxNode): {
        name: string;
        type: 'member' | 'function';
    }[] {
        const chain = [] as {
            name: string;
            type: 'member' | 'function';
        }[];

        let currentNode: SyntaxNode | null = node;

        const {
            callNodeTypes,
            memberNodeTypes,
            functionNameFields,
            instanceNameTypes,
            functionChildFields,
        } = this.memberChainNodeTypes;

        while (currentNode) {
            if (callNodeTypes.includes(currentNode.type)) {
                for (const functionNameField of functionNameFields) {
                    const memberNameNode =
                        currentNode.childForFieldName(functionNameField);
                    if (memberNameNode) {
                        chain.unshift({
                            name: memberNameNode.text,
                            type: 'function',
                        });
                        break;
                    }
                }
            }
            if (memberNodeTypes.includes(currentNode.type)) {
                for (const functionNameField of functionNameFields) {
                    const memberNameNode =
                        currentNode.childForFieldName(functionNameField);
                    if (memberNameNode) {
                        chain.unshift({
                            name: memberNameNode.text,
                            type: 'member',
                        });
                        break;
                    }
                }
            }
            if (instanceNameTypes.includes(currentNode.type)) {
                chain.unshift({
                    name: currentNode.text,
                    type: 'member',
                });
            }
            if (currentNode.text === this.selfAccessReference) {
                chain.unshift({
                    name: this.selfAccessReference,
                    type: 'member',
                });
            }
            let childNodeFound = false;
            for (const functionChildField of functionChildFields) {
                const childNode =
                    currentNode.childForFieldName(functionChildField);
                if (childNode) {
                    currentNode = childNode;
                    childNodeFound = true;
                    break;
                }
            }
            if (!childNodeFound) {
                break; // Exit the loop if no child node is found
            }
        }

        return chain;
    }

    protected resolveTargetFile(
        instanceName: string,
        absolutePath: string,
        scope: Scope[],
    ): string {
        const noMethodScopeIdx = findLastIndexOf(
            scope,
            (s) => s.type === ScopeType.METHOD,
        );
        if (noMethodScopeIdx !== -1) {
            scope = scope.slice(0, scope.length - noMethodScopeIdx);
        }

        let typeName = this.context.instanceMapping.get(
            `${this.scopeToString(scope)}::${instanceName}`,
        );

        if (typeName) {
            typeName = typeName.split('::').pop() || instanceName;
        } else {
            typeName = instanceName;
        }

        return this.context.importedMapping.get(typeName) || absolutePath;
    }

    protected scopeToString(scope: Scope[]): string {
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
