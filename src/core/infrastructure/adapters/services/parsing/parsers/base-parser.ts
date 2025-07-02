import * as Parser from 'tree-sitter';
import { Query, QueryCapture, QueryMatch, SyntaxNode } from 'tree-sitter';
import { Language } from 'tree-sitter';
import {
    CallChain,
    ChainType,
    ImportedSymbol,
    Method,
    ObjectProperties,
    ParseContext,
} from '@/core/domain/parsing/types/parser';
import {
    objQueries,
    ParserQuery,
    queryToNodeTypeMap,
    QueryType,
} from './query';
import {
    AnalysisNode,
    Call,
    Scope,
    TypeAnalysis,
    NodeType,
    Range,
} from '@kodus/kodus-proto/ast/v2';
import { normalizeAST, normalizeSignature } from '@/shared/utils/ast-helpers';
import { appendOrUpdateElement, findLastIndexOf } from '@/shared/utils/arrays';
import { LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract';
import { ResolvedImport } from '@/core/domain/parsing/types/language-resolver';
import { nanoid } from 'nanoid';

export abstract class BaseParser {
    private static readonly parserByLang = new Map<string, Parser>();
    private static readonly queryCacheByLang = new Map<
        string,
        Map<QueryType, Query>
    >();

    private parser: Parser;
    private queries: Map<QueryType, Query>;

    protected abstract getLanguage(): Language;
    protected abstract getRawQueries(): Map<QueryType, ParserQuery>;
    protected abstract getConstructorName(): string;
    protected abstract getSelfAccessReference(): string;
    protected abstract getValidMemberTypes(): Set<string>;
    protected abstract getValidFunctionTypes(): Set<string>;

    constructor(
        private readonly importPathResolver: LanguageResolver,
        private readonly context: ParseContext,
    ) {
        this.setupParser();
        this.setupQueries();
    }

    private setupParser(): void {
        const lang = this.getLanguage();
        const id = lang.name;

        let cached = BaseParser.parserByLang.get(id);
        if (!cached) {
            cached = new Parser();

            cached.setLanguage(lang);
            BaseParser.parserByLang.set(id, cached);
        }
        this.parser = cached;
    }

    private setupQueries(): void {
        const id = this.getLanguage().name;

        let qMap = BaseParser.queryCacheByLang.get(id);
        if (!qMap) {
            qMap = new Map<QueryType, Query>();
            for (const [k, v] of this.getRawQueries()) {
                qMap.set(k, new Query(this.getLanguage(), v.query));
            }
            BaseParser.queryCacheByLang.set(id, qMap);
        }
        this.queries = qMap;
    }

    public getParser(): Parser {
        if (!this.parser) {
            throw new Error('Parser not set up');
        }

        return this.parser;
    }

    protected getQuery(type: QueryType): Query | null {
        if (!this.queries || this.queries.size === 0) {
            throw new Error('Queries not set up');
        }
        const query = this.queries.get(type);
        if (!query) {
            return null;
        }
        return query;
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
        const query = this.getQuery(QueryType.IMPORT);
        if (!query) return;

        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        for (const match of matches) {
            const captures = match.captures;

            const importCap = captures.find(
                (capture) => capture.name === 'import',
            );
            if (!importCap || !importCap.node) continue;

            const analysisNode = this.newAnalysisNode(
                importCap.node,
                NodeType.NODE_TYPE_IMPORT,
            );
            this.registerAnalysisNode(analysisNode);

            const originName = this.processImportOrigin(match, analysisNode);
            this.addNameToAnalysisNode(analysisNode, originName);

            const imported = this.processImportedSymbols(
                captures,
                analysisNode,
            );
            const resolvedImport = this.resolveImportWithCache(
                originName,
                imported,
                filePath,
            );
            if (!resolvedImport) continue;

            const normalizedPath = resolvedImport.normalizedPath || originName;
            this.context.fileImports.add(normalizedPath);

            this.registerImportedSymbols(imported, normalizedPath);
        }
    }

    protected processImportOrigin(
        match: QueryMatch,
        parentNode: AnalysisNode,
    ): string | null {
        const originCapture = match.captures.find(
            (capture) => capture.name === 'origin',
        );
        if (!originCapture || !originCapture.node) return;
        const originNode = originCapture.node;

        this.addChildSyntaxNodeToNode(parentNode, originNode);
        return this.getImportOriginName(originNode);
    }

    protected getImportOriginName(node: SyntaxNode): string | null {
        return node ? node.text : null;
    }

    protected processImportedSymbols(
        captures: QueryCapture[],
        parentNode: AnalysisNode,
    ): ImportedSymbol[] {
        const imported: ImportedSymbol[] = [];

        for (const capture of captures) {
            const captureName = capture.name;
            const nodeText = capture.node.text;

            switch (captureName) {
                case 'symbol': {
                    appendOrUpdateElement(imported, {
                        nodeId: this.mapNodeId(capture.node),
                        symbol: nodeText,
                    });
                    break;
                }
                case 'alias': {
                    appendOrUpdateElement(imported, {
                        alias: nodeText,
                    });
                    break;
                }
            }

            this.addChildSyntaxNodeToNode(parentNode, capture.node);
        }

        if (imported.length === 0) {
            let nodeId = '';
            let alias: string | null = null;
            const aliasCapture = captures.find(
                (capture) => capture.name === 'alias',
            );
            if (aliasCapture) {
                nodeId = this.mapNodeId(aliasCapture.node);
                alias = aliasCapture.node.text;
            }
            imported.push({
                nodeId,
                symbol: '*',
                alias,
            });
        } else if (
            imported.length === 1 &&
            imported[0].alias &&
            !imported[0].symbol
        ) {
            const first = imported[0];
            const aliasCapture = captures.find(
                (capture) => capture.name === 'alias',
            );
            first.symbol = '*';
            first.nodeId = this.mapNodeId(aliasCapture.node);
        }

        return imported;
    }

    protected registerImportedSymbols(
        imported: ImportedSymbol[],
        normalizedPath: string,
    ): void {
        for (const { nodeId, symbol, alias } of imported) {
            this.context.importedMapping.set(nodeId, symbol);
            this.context.importedMapping.set(symbol, normalizedPath);
            if (alias) {
                this.context.importedMapping.set(alias, symbol);
            }
        }
    }

    protected collectObjDeclarations(
        rootNode: SyntaxNode,
        absolutePath: string,
        type: QueryType,
    ): void {
        const query = this.getQuery(type);
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
        type: QueryType,
    ): TypeAnalysis {
        const objAnalysis: TypeAnalysis = {
            nodeId: '',
            position: null,
            name: '',
            extends: [],
            implements: [],
            fields: new Map<string, string>(),
            extendedBy: [],
            implementedBy: [],
            scope: [],
            file: absolutePath,
            type: queryToNodeTypeMap.get(type),
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

        const analysisNode = this.context.analysisNodes.get(objAnalysis.nodeId);
        this.addNameToAnalysisNode(analysisNode, objAnalysis.name);

        return objAnalysis;
    }

    protected processObjCapture(
        capture: QueryCapture,
        objAnalysis: TypeAnalysis,
        methods: Method[],
        objProps: ObjectProperties,
    ): void {
        const node = capture.node;
        if (!node) return;

        const text = node.text;

        const lastMethod = methods[methods.length - 1];

        switch (capture.name) {
            case 'obj': {
                const analysisNode = this.newAnalysisNode(
                    node,
                    objAnalysis.type,
                );
                this.registerAnalysisNode(analysisNode);
                objAnalysis.nodeId = this.mapNodeId(node);
                objAnalysis.position = this.getNodeRange(node);
                break;
            }
            case 'objName': {
                const scopeChain = this.getScopeChain(node);
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
                this.addNewMethod(methods, node);
                break;
            }
            case 'objMethodParams': {
                this.processMethodParameters(lastMethod, node);
                break;
            }
            case 'objMethodReturnType': {
                this.setMethodReturnType(lastMethod, text);
                break;
            }
            case 'objProperty': {
                appendOrUpdateElement(objProps.properties, {
                    nodeId: this.mapNodeId(node),
                    name: text,
                });
                break;
            }
            case 'objPropertyType': {
                appendOrUpdateElement(objProps.properties, {
                    type: text,
                });
                break;
            }
            case 'objPropertyValue': {
                appendOrUpdateElement(objProps.properties, {
                    value: text,
                });
                break;
            }
            case 'enumType': {
                objProps.type = text;
                break;
            }
            default: {
                if (this.processExtraObjCapture)
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

    /**
     * Override this method to process extra captures that are not handled by the default implementation.
     * See Ruby parser for an example.
     */
    protected processExtraObjCapture?(
        capture: QueryCapture,
        objAnalysis: TypeAnalysis,
        methods: Method[],
        objProps: ObjectProperties,
    ): void;

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

    protected addNewMethod(methods: Method[], node: SyntaxNode): void {
        if (!node || !node.id) return;

        methods.push({
            nodeId: this.mapNodeId(node),
            name: node.text,
            params: [],
            returnType: null,
            bodyNode: null,
            scope: [],
            position: this.getNodeRange(node),
        });
    }

    protected processMethodParameters(method: Method, node: SyntaxNode) {
        const query = this.getQuery(QueryType.FUNCTION_PARAMETERS);
        if (!query) return;

        const matches = query.matches(node);
        if (matches.length === 0) return;

        for (const match of matches) {
            for (const capture of match.captures) {
                switch (capture.name) {
                    case 'funcParamName': {
                        appendOrUpdateElement(method.params, {
                            nodeId: this.mapNodeId(capture.node),
                            name: capture.node.text,
                        });
                        break;
                    }
                    case 'funcParamType': {
                        appendOrUpdateElement(method.params, {
                            type: capture.node.text,
                        });
                        break;
                    }
                }
            }
        }
    }

    protected setMethodReturnType(method: Method, returnType: string): void {
        if (!method) return;
        method.returnType = returnType;
    }

    protected processMethods(
        objAnalysis: TypeAnalysis,
        methods: Method[],
    ): void {
        if (!objAnalysis.fields) {
            objAnalysis.fields = new Map<string, string>();
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
            objAnalysis.fields = new Map<string, string>();
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
            (method) => method.name === this.getConstructorName(),
        );
        if (!constructor) return;

        for (const { nodeId, name, type } of constructor.params) {
            if (nodeId && name && type && objAnalysis.scope) {
                const fullName = `${this.scopeToString(objAnalysis.scope)}::${name}`;
                const fullType = `${this.scopeToString(objAnalysis.scope)}::${type}`;

                this.context.instanceMapping.set(nodeId.toString(), fullName);
                this.context.instanceMapping.set(fullName, fullType);
                this.context.instanceMapping.set(fullType, fullName);
            }
        }
    }

    protected collectFunctionDetails(
        rootNode: SyntaxNode,
        absolutePath: string,
    ): void {
        const query = this.getQuery(QueryType.FUNCTION);
        if (!query) return;

        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        for (const match of matches) {
            const captures = match.captures;
            if (captures.length === 0) continue;

            const method: Method = {
                nodeId: '',
                name: '',
                params: [],
                returnType: null,
                bodyNode: null,
                scope: [],
                position: null,
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
                    .find((scope) => scope.type === NodeType.NODE_TYPE_CLASS)
                    ?.name ||
                method.scope
                    .reverse()
                    .find((scope) =>
                        [
                            NodeType.NODE_TYPE_ENUM,
                            NodeType.NODE_TYPE_INTERFACE,
                        ].includes(scope.type),
                    )?.name ||
                '';
            const analysisNode = this.context.analysisNodes.get(method.nodeId);
            if (analysisNode) {
                this.addNameToAnalysisNode(analysisNode, method.name);
            }

            this.context.functions.set(key, {
                nodeId: method.nodeId,
                position: analysisNode?.position,
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
            case 'func': {
                const analysisNode = this.newAnalysisNode(
                    node,
                    NodeType.NODE_TYPE_FUNCTION,
                );
                this.registerAnalysisNode(analysisNode);
                method.nodeId = this.mapNodeId(node);
                method.position = this.getNodeRange(node);
                break;
            }
            case 'funcName': {
                const scopeChain = this.getScopeChain(node);
                method.name = node.text;
                method.scope = scopeChain;
                break;
            }
            case 'funcParams': {
                this.processMethodParameters(method, node);
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

        const analysisNode = this.newAnalysisNode(
            node,
            NodeType.NODE_TYPE_FUNCTION,
        );
        const parentNode = this.context.analysisNodes.get(method.nodeId);
        if (parentNode) {
            this.addChildToNode(parentNode, analysisNode);
        }
    }

    protected collectFunctionCalls(
        rootNode: SyntaxNode,
        absolutePath: string,
        scope: Scope[],
    ): Call[] {
        const query = this.getQuery(QueryType.FUNCTION_CALL);
        if (!query) return [];

        const matches = query.matches(rootNode);
        if (matches.length === 0) return [];

        const calls: Call[] = [];
        const chains = new Map<number, CallChain[]>();

        for (const match of matches) {
            const captures = match.captures;
            if (captures.length === 0) continue;

            for (const capture of captures) {
                const node = capture.node;
                if (!node) continue;

                if (chains.has(node.id)) {
                    continue;
                }

                const chain = this.getMemberChain(node, chains);
                if (!chain || chain.length === 0) continue;

                let caller = this.getSelfAccessReference();
                let targetFile: string;

                if (chain.length === 1) {
                    targetFile = this.resolveTargetFile(
                        chain[0].name,
                        absolutePath,
                        scope,
                    );
                } else {
                    targetFile = this.resolveTargetFile(
                        caller,
                        absolutePath,
                        scope,
                    );
                }

                for (const { name, type, nodeId } of chain) {
                    if (type === ChainType.FUNCTION) {
                        calls.push({
                            nodeId,
                            function: name,
                            file: targetFile,
                            caller,
                        });
                    }

                    caller = name;
                    targetFile = this.resolveTargetFile(
                        caller,
                        absolutePath,
                        scope,
                    );
                }
            }
        }

        return calls;
    }

    protected collectTypeAliases(
        rootNode: SyntaxNode,
        absolutePath: string,
    ): void {
        const query = this.getQuery(QueryType.TYPE_ALIAS);
        if (!query) return;

        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        for (const match of matches) {
            const captures = match.captures;
            if (captures.length === 0) continue;

            const typeAnalysis: TypeAnalysis = {
                nodeId: '',
                position: null,
                name: '',
                extends: [],
                implements: [],
                fields: new Map<string, string>(),
                extendedBy: [],
                implementedBy: [],
                scope: [],
                file: absolutePath,
                type: NodeType.NODE_TYPE_TYPE_ALIAS,
            };

            for (const capture of captures) {
                const node = capture.node;
                if (!node) continue;

                const typeFields = [] as string[];

                switch (capture.name) {
                    case 'typeAlias': {
                        const analysisNode = this.newAnalysisNode(
                            node,
                            NodeType.NODE_TYPE_TYPE_ALIAS,
                        );
                        this.registerAnalysisNode(analysisNode);
                        typeAnalysis.nodeId = this.mapNodeId(node);
                        typeAnalysis.position = this.getNodeRange(node);
                        break;
                    }
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

            const analysisNode = this.context.analysisNodes.get(
                typeAnalysis.nodeId,
            );
            if (analysisNode) {
                this.addNameToAnalysisNode(analysisNode, typeAnalysis.name);
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

        while (currentNode) {
            const scope = this.getScopeTypeForNode(currentNode);
            if (scope) {
                chain.unshift(scope);
            }

            currentNode = currentNode.parent;
        }

        return chain;
    }

    protected abstract getScopeTypeForNode(node: SyntaxNode): Scope | null;

    protected abstract processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean;

    protected getMemberChain(
        node: SyntaxNode,
        chains: Map<number, CallChain[]>,
    ): CallChain[] {
        if (!node) return [];

        const chain: CallChain[] = [];
        let currentNode: SyntaxNode | null = node;

        while (currentNode) {
            const cached = chains.get(currentNode.id);
            if (cached) {
                chain.push(...cached);
                break;
            }

            const processed = this.processChainNode(currentNode, chain);
            if (!processed) return chain;

            chains.set(currentNode.id, [...chain]);
            currentNode = currentNode.parent;
        }

        return chain;
    }

    protected addToChain(
        field: SyntaxNode | null,
        type: ChainType,
        chain: CallChain[],
        nodeId: string,
    ) {
        if (!field) return;

        const validTypes =
            type === ChainType.FUNCTION
                ? this.getValidFunctionTypes()
                : this.getValidMemberTypes();

        if (validTypes.has(field.type)) {
            chain.push({
                name: field.text,
                type,
                nodeId,
            });
        }
    }

    protected resolveTargetFile(
        instanceName: string,
        absolutePath: string,
        scope: Scope[],
    ): string {
        const noMethodScopeIdx = findLastIndexOf(
            scope,
            (s) => s.type === NodeType.NODE_TYPE_FUNCTION,
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
        origin: string,
        imported: { symbol: string; alias: string | null }[],
        filePath: string,
    ): ResolvedImport {
        const importedModule = {
            origin,
            imported,
        };

        const resolved = this.importPathResolver.resolveImport(
            importedModule,
            filePath,
        );
        return resolved;
    }

    protected extractTokensFromNode(node: SyntaxNode): string[] {
        return node.text.match(/\b[\w$]+\b/g) || [];
    }

    protected normalizeSignatureText(original: string): string {
        return original.replace(/\s+/g, ' ').trim();
    }

    protected newAnalysisNode(
        node: SyntaxNode,
        type: NodeType,
        name?: string,
    ): AnalysisNode | null {
        if (!node) return null;
        const newNode = {
            id: this.mapNodeId(node),
            name: name || '',
            type,
            text: node.text,
            position: {
                endIndex: node.endIndex,
                startIndex: node.startIndex,
                startPosition: node.startPosition,
                endPosition: node.endPosition,
            },
            children: [],
        };

        return newNode;
    }

    protected addNameToAnalysisNode(node: AnalysisNode, name: string): void {
        if (!node || !name) return;
        if (node.name && node.name !== name) {
            node.name = `${node.name}::${name}`;
        } else {
            node.name = name;
        }
    }

    protected addChildToNode(parent: AnalysisNode, child: AnalysisNode): void {
        if (!parent.children) {
            parent.children = [];
        }

        if (parent.id === child.id) return;

        parent.children.push(child);
    }

    protected addChildSyntaxNodeToNode(
        parent: AnalysisNode,
        child: SyntaxNode,
        type: NodeType = parent.type,
        name: string = child.text,
    ): AnalysisNode | null {
        if (!parent.children) {
            parent.children = [];
        }

        if (parent.id === this.mapNodeId(child)) return null;

        const childNode = this.newAnalysisNode(child, type, name);
        if (childNode) {
            parent.children.push(childNode);
        }
        return childNode;
    }

    protected registerAnalysisNode(node: AnalysisNode): void {
        if (!node || !node.id) return;

        if (this.context.analysisNodes.has(node.id)) {
            return;
        }

        this.context.analysisNodes.set(node.id, node);
    }

    protected getNodeRange(node: SyntaxNode): Range {
        return {
            startIndex: node.startIndex,
            endIndex: node.endIndex,
            startPosition: node.startPosition,
            endPosition: node.endPosition,
        };
    }

    protected mapNodeId(node: SyntaxNode): string {
        if (!node || !node.id) {
            throw new Error('Node ID is not set');
        }

        const existingId = this.context.nodeIdMap.get(node.id);
        if (existingId) {
            return existingId;
        }

        const newId = nanoid();

        this.context.nodeIdMap.set(node.id, newId);
        this.context.idMap.set(newId, node.id);

        return newId;
    }
}
