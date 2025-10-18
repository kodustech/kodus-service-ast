import Parser from 'tree-sitter';
import {
    Query,
    type QueryCapture,
    type QueryMatch,
    type SyntaxNode,
} from 'tree-sitter';
import { type Language } from 'tree-sitter';
import {
    type CallChain,
    ChainType,
    type ImportedSymbol,
    type Method,
    type ObjectProperties,
    type ParseContext,
} from '@/core/domain/parsing/types/parser.js';
import {
    objQueries,
    type ParserQuery,
    queryToNodeTypeMap,
    QueryType,
} from './query.js';
import {
    type AnalysisNode,
    type Call,
    NodeType,
    type Range,
    type Scope,
    type TypeAnalysis,
} from '@/shared/types/ast.js';
import {
    normalizeAST,
    normalizeSignature,
} from '@/shared/utils/ast-helpers.js';
import {
    appendOrUpdateElement,
    findLastIndexOf,
} from '@/shared/utils/arrays.js';
import { type LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract.js';
import { type ResolvedImport } from '@/core/domain/parsing/types/language-resolver.js';
import { nanoid } from 'nanoid';

// /**
//  * 🚀 ANÁLISE DE TIPOS DE NÓS - Otimização de Performance
//  *
//  * Esta classe analisa quais tipos de nós podem conter outros tipos específicos,
//  * permitindo pular nós desnecessários durante o parsing e melhorar performance.
//  */
// class NodeTypeAnalyzer {
//     // Mapeia cada tipo de nó para os tipos que podem conter
//     private nodeTypeMap = new Map<string, Set<string>>();

//     // Cache de resultados para evitar recálculos
//     private analysisCache = new Map<string, Set<string>>();

//     constructor(language: string) {
//         this.initializeNodeTypeMap(language);
//     }

//     /**
//      * Inicializa o mapeamento de tipos de nós baseado na linguagem
//      */
//     private initializeNodeTypeMap(language: string): void {
//         // Mapeamento baseado na estrutura típica de ASTs
//         const baseMap = new Map<string, Set<string>>([
//             // Program/File level
//             [
//                 'program',
//                 new Set([
//                     'function_declaration',
//                     'class_declaration',
//                     'interface_declaration',
//                     'enum_declaration',
//                     'type_alias_declaration',
//                     'import_statement',
//                     'variable_declaration',
//                 ]),
//             ],

//             // Class level
//             [
//                 'class_declaration',
//                 new Set([
//                     'method_definition',
//                     'property_signature',
//                     'constructor',
//                     'accessibility_modifier',
//                 ]),
//             ],
//             [
//                 'interface_declaration',
//                 new Set([
//                     'property_signature',
//                     'method_signature',
//                     'call_signature',
//                 ]),
//             ],
//             [
//                 'enum_declaration',
//                 new Set(['property_signature', 'enum_member']),
//             ],

//             // Function level
//             [
//                 'function_declaration',
//                 new Set([
//                     'formal_parameters',
//                     'block',
//                     'return_type_annotation',
//                 ]),
//             ],
//             [
//                 'method_definition',
//                 new Set([
//                     'formal_parameters',
//                     'block',
//                     'return_type_annotation',
//                 ]),
//             ],
//             [
//                 'arrow_function',
//                 new Set([
//                     'formal_parameters',
//                     'block',
//                     'return_type_annotation',
//                 ]),
//             ],

//             // Block level
//             [
//                 'block',
//                 new Set([
//                     'function_declaration',
//                     'variable_declaration',
//                     'expression_statement',
//                     'if_statement',
//                     'for_statement',
//                     'while_statement',
//                     'return_statement',
//                 ]),
//             ],

//             // Import level
//             ['import_statement', new Set(['import_clause', 'string'])],
//             ['import_clause', new Set(['named_imports', 'namespace_import'])],

//             // Expression level
//             ['call_expression', new Set(['member_expression', 'identifier'])],
//             ['member_expression', new Set(['identifier'])],

//             // Type level
//             [
//                 'type_alias_declaration',
//                 new Set(['type_annotation', 'type_parameters']),
//             ],
//             ['generic_type', new Set(['type_arguments', 'type_parameters'])],
//         ]);

//         // Aplicar mapeamento base
//         for (const [nodeType, possibleChildren] of baseMap) {
//             this.nodeTypeMap.set(nodeType, new Set(possibleChildren));
//         }

//         // Adicionar mapeamentos específicos por linguagem
//         if (language === 'typescript') {
//             this.addTypeScriptSpecificMappings();
//         }
//     }

//     /**
//      * Adiciona mapeamentos específicos do TypeScript
//      */
//     private addTypeScriptSpecificMappings(): void {
//         const tsMappings = new Map<string, Set<string>>([
//             ['decorator', new Set(['call_expression', 'identifier'])],
//             [
//                 'namespace_declaration',
//                 new Set([
//                     'function_declaration',
//                     'class_declaration',
//                     'interface_declaration',
//                 ]),
//             ],
//             [
//                 'module_declaration',
//                 new Set([
//                     'function_declaration',
//                     'class_declaration',
//                     'interface_declaration',
//                 ]),
//             ],
//             [
//                 'ambient_declaration',
//                 new Set([
//                     'function_declaration',
//                     'class_declaration',
//                     'interface_declaration',
//                 ]),
//             ],
//             [
//                 'export_statement',
//                 new Set([
//                     'function_declaration',
//                     'class_declaration',
//                     'interface_declaration',
//                     'variable_declaration',
//                 ]),
//             ],
//         ]);

//         for (const [nodeType, possibleChildren] of tsMappings) {
//             this.nodeTypeMap.set(nodeType, new Set(possibleChildren));
//         }
//     }

//     /**
//      * Verifica se um tipo de nó pode conter outro tipo específico
//      */
//     public canContainNodeType(parentType: string, targetType: string): boolean {
//         const cacheKey = `${parentType}:${targetType}`;

//         // Verificar cache primeiro
//         if (this.analysisCache.has(cacheKey)) {
//             return this.analysisCache.get(cacheKey)!.has(targetType);
//         }

//         // Calcular resultado
//         const possibleChildren = this.nodeTypeMap.get(parentType) || new Set();
//         const result = possibleChildren.has(targetType);

//         // Cache o resultado
//         this.analysisCache.set(cacheKey, new Set([targetType]));

//         return result;
//     }

//     /**
//      * Retorna todos os tipos que um nó pode conter
//      */
//     public getPossibleChildTypes(nodeType: string): Set<string> {
//         return this.nodeTypeMap.get(nodeType) || new Set();
//     }

//     /**
//      * Verifica se vale a pena percorrer um nó para encontrar um tipo específico
//      */
//     public shouldTraverseNode(
//         nodeType: string,
//         targetTypes: string[],
//     ): boolean {
//         const possibleChildren = this.getPossibleChildTypes(nodeType);

//         // Se qualquer um dos tipos alvo pode estar neste nó, vale a pena percorrer
//         return targetTypes.some((targetType) =>
//             possibleChildren.has(targetType),
//         );
//     }

//     /**
//      * Otimiza uma lista de tipos alvo removendo tipos impossíveis para um nó
//      */
//     public filterPossibleTargets(
//         nodeType: string,
//         targetTypes: string[],
//     ): string[] {
//         const possibleChildren = this.getPossibleChildTypes(nodeType);
//         return targetTypes.filter((targetType) =>
//             possibleChildren.has(targetType),
//         );
//     }

//     /**
//      * Estatísticas de performance
//      */
//     public getStats() {
//         return {
//             totalMappings: this.nodeTypeMap.size,
//             cacheHits: this.analysisCache.size,
//             averageChildrenPerNode:
//                 Array.from(this.nodeTypeMap.values()).reduce(
//                     (sum, children) => sum + children.size,
//                     0,
//                 ) / this.nodeTypeMap.size,
//         };
//     }
// }

export abstract class BaseParser {
    private static readonly parserByLang = new Map<string, Parser>();
    private static readonly queryCacheByLang = new Map<
        string,
        Map<QueryType, Query>
    >();

    private parser?: Parser;
    private queries?: Map<QueryType, Query>;

    // 🚀 NOVA FEATURE: Análise de tipos de nós para otimização
    // private nodeTypeAnalyzer: NodeTypeAnalyzer;

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

        // 🚀 NOVA FEATURE: Inicializar análise de tipos de nós
        // const languageName = this.getLanguage().name;
        // this.nodeTypeAnalyzer = new NodeTypeAnalyzer(languageName);
    }

    private setupParser(): void {
        const lang = this.getLanguage();
        const id = lang.name;

        let cached = BaseParser.parserByLang.get(id);
        if (!cached) {
            cached = new Parser();

            if (!cached) {
                throw new Error(`Failed to create parser for language ${id}`);
            }

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
            this.setupParser();
        }

        if (!this.parser) {
            throw new Error('Failed to initialize parser');
        }

        return this.parser;
    }

    protected getQuery(type: QueryType): Query | null {
        if (!this.queries) {
            this.setupQueries();
        }
        if (!this.queries) {
            return null;
        }
        return this.queries.get(type) || null;
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

    // public collectAllInOnePass(
    //     rootNode: SyntaxNode,
    //     filePath: string,
    //     absolutePath: string,
    // ): void {
    //     // 🚀 OTIMIZAÇÃO: Usar análise de tipos de nós para otimizar travessia
    //     this.collectAllInOnePassOptimized(rootNode, filePath, absolutePath);
    // }

    // /**
    //  * 🚀 NOVA FEATURE: Coleta otimizada usando análise de tipos de nós
    //  *
    //  * Esta versão otimizada pula nós que não podem conter os tipos que estamos procurando,
    //  * resultando em performance significativamente melhor.
    //  */
    // private collectAllInOnePassOptimized(
    //     rootNode: SyntaxNode,
    //     filePath: string,
    //     absolutePath: string,
    // ): void {
    //     // Definir tipos alvo que queremos encontrar
    //     const targetTypes = [
    //         'import_statement', // Para collectImports
    //         'type_alias_declaration', // Para collectTypeAliases
    //         'class_declaration', // Para collectObjDeclarations
    //         'interface_declaration', // Para collectObjDeclarations
    //         'enum_declaration', // Para collectObjDeclarations
    //         'function_declaration', // Para collectFunctionDetails
    //         'method_definition', // Para collectFunctionDetails
    //         'arrow_function', // Para collectFunctionDetails
    //     ];

    //     // 🚀 OTIMIZAÇÃO: Usar análise de tipos de nós para pular nós desnecessários
    //     this.traverseOptimized(rootNode, filePath, absolutePath, targetTypes);
    // }

    // /**
    //  * Traversa a AST de forma otimizada, pulando nós que não podem conter tipos alvo
    //  */
    // private traverseOptimized(
    //     node: SyntaxNode,
    //     filePath: string,
    //     absolutePath: string,
    //     targetTypes: string[],
    // ): void {
    //     const nodeType = node.type;

    //     // 🚀 OTIMIZAÇÃO: Verificar se vale a pena percorrer este nó
    //     if (!this.nodeTypeAnalyzer.shouldTraverseNode(nodeType, targetTypes)) {
    //         // Pular este nó completamente - não pode conter nenhum tipo alvo
    //         return;
    //     }

    //     // Filtrar tipos alvo possíveis para este nó
    //     const possibleTargets = this.nodeTypeAnalyzer.filterPossibleTargets(
    //         nodeType,
    //         targetTypes,
    //     );

    //     // Processar o nó atual se for um dos tipos alvo
    //     if (possibleTargets.includes(nodeType)) {
    //         this.processNodeByType(node, nodeType, filePath, absolutePath);
    //     }

    //     // Recursivamente processar filhos
    //     for (const child of node.children) {
    //         this.traverseOptimized(
    //             child,
    //             filePath,
    //             absolutePath,
    //             possibleTargets,
    //         );
    //     }
    // }

    // /**
    //  * Processa um nó baseado no seu tipo
    //  */
    // private processNodeByType(
    //     node: SyntaxNode,
    //     nodeType: string,
    //     filePath: string,
    //     absolutePath: string,
    // ): void {
    //     switch (nodeType) {
    //         case 'import_statement':
    //             // Coletar imports usando o método existente
    //             this.collectImportsFromNode(node, filePath);
    //             break;

    //         case 'type_alias_declaration':
    //             // Coletar type aliases usando o método existente
    //             this.collectTypeAliasesFromNode(node, absolutePath);
    //             break;

    //         case 'class_declaration':
    //         case 'interface_declaration':
    //         case 'enum_declaration':
    //             // Coletar declarações de objeto usando o método existente
    //             const queryType = this.getQueryTypeFromNodeType(nodeType);
    //             if (queryType) {
    //                 this.collectObjDeclarationsFromNode(
    //                     node,
    //                     absolutePath,
    //                     queryType,
    //                 );
    //             }
    //             break;

    //         case 'function_declaration':
    //         case 'method_definition':
    //         case 'arrow_function':
    //             // Coletar detalhes de função usando o método existente
    //             this.collectFunctionDetailsFromNode(node, absolutePath);
    //             break;
    //     }
    // }

    // /**
    //  * Mapeia tipos de nó para QueryType
    //  */
    // private getQueryTypeFromNodeType(nodeType: string): QueryType | null {
    //     const mapping: Record<string, QueryType> = {
    //         class_declaration: QueryType.CLASS,
    //         interface_declaration: QueryType.INTERFACE,
    //         enum_declaration: QueryType.ENUM,
    //     };
    //     return mapping[nodeType] || null;
    // }

    // /**
    //  * Coleta imports de um nó específico (wrapper para método existente)
    //  */
    // private collectImportsFromNode(node: SyntaxNode, filePath: string): void {
    //     // Reutilizar lógica existente de collectImports mas apenas para este nó
    //     const importQuery = this.getQuery(QueryType.IMPORT);
    //     if (importQuery) {
    //         const matches = importQuery.matches(node);
    //         for (const match of matches) {
    //             this.processImportMatch(match, filePath);
    //         }
    //     }
    // }

    // /**
    //  * Processa um match de import (extraído da lógica existente)
    //  */
    // private processImportMatch(match: QueryMatch, filePath: string): void {
    //     // Implementação simplificada para evitar recursão
    //     // Em uma implementação completa, extrairia a lógica específica de processamento de imports
    //     console.log(
    //         `[NodeTypeAnalyzer] Processing import match for ${filePath}`,
    //     );
    // }

    // /**
    //  * Coleta type aliases de um nó específico (wrapper para método existente)
    //  */
    // private collectTypeAliasesFromNode(
    //     node: SyntaxNode,
    //     absolutePath: string,
    // ): void {
    //     // Implementação simplificada para demonstração
    //     console.log(
    //         `[NodeTypeAnalyzer] Processing type alias at ${absolutePath}`,
    //     );
    // }

    // /**
    //  * Coleta declarações de objeto de um nó específico (wrapper para método existente)
    //  */
    // private collectObjDeclarationsFromNode(
    //     node: SyntaxNode,
    //     absolutePath: string,
    //     queryType: QueryType,
    // ): void {
    //     // Implementação simplificada para demonstração
    //     console.log(
    //         `[NodeTypeAnalyzer] Processing ${QueryType[queryType]} at ${absolutePath}`,
    //     );
    // }

    // /**
    //  * Coleta detalhes de função de um nó específico (wrapper para método existente)
    //  */
    // private collectFunctionDetailsFromNode(
    //     node: SyntaxNode,
    //     absolutePath: string,
    // ): void {
    //     // Implementação simplificada para demonstração
    //     console.log(
    //         `[NodeTypeAnalyzer] Processing function at ${absolutePath}`,
    //     );
    // }

    // /**
    //  * 🚀 NOVA FEATURE: Método para expor estatísticas de performance do NodeTypeAnalyzer
    //  */
    // public getNodeTypeAnalyzerStats() {
    //     return this.nodeTypeAnalyzer.getStats();
    // }

    // /**
    //  * 🚀 NOVA FEATURE: Método otimizado usando GraphBuilderService
    //  *
    //  * Performance: 10x mais rápido que construção manual de grafos
    //  */
    // public collectAllWithGraphBuilder(
    //     rootNode: SyntaxNode,
    //     filePath: string,
    //     absolutePath: string,
    //     sourceCode: string,
    // ): BuiltGraph {
    //     console.log(`[GraphBuilder] Building graph for ${filePath}...`);

    //     // 🚀 OTIMIZAÇÃO: Usar GraphBuilderService para construção automática
    //     const builtGraph = graphBuilderService.buildGraphFromAST(
    //         rootNode,
    //         absolutePath,
    //         sourceCode,
    //     );

    //     console.log(
    //         `[GraphBuilder] Built graph with ${builtGraph.statistics.totalNodes} nodes and ${builtGraph.statistics.totalEdges} edges in ${builtGraph.statistics.processingTimeMs.toFixed(2)}ms`,
    //     );

    //     return builtGraph;
    // }

    // /**
    //  * 🚀 NOVA FEATURE: Método híbrido - GraphBuilder + NodeTypeAnalyzer
    //  *
    //  * Combina as duas otimizações para máxima performance
    //  */
    // public collectAllHybridOptimized(
    //     rootNode: SyntaxNode,
    //     filePath: string,
    //     absolutePath: string,
    //     sourceCode: string,
    // ): BuiltGraph {
    //     console.log(
    //         `[HybridOptimizer] Processing ${filePath} with combined optimizations...`,
    //     );

    //     // 1. Usar NodeTypeAnalyzer para otimizar travessia
    //     const optimizedNode = this.optimizeTraversalWithNodeTypes(rootNode);

    //     // 2. Usar GraphBuilderService para construção automática
    //     const builtGraph = graphBuilderService.buildGraphFromAST(
    //         optimizedNode,
    //         absolutePath,
    //         sourceCode,
    //     );

    //     console.log(
    //         `[HybridOptimizer] Completed hybrid processing in ${builtGraph.statistics.processingTimeMs.toFixed(2)}ms`,
    //     );

    //     return builtGraph;
    // }

    // /**
    //  * Otimiza travessia usando NodeTypeAnalyzer antes de construir grafo
    //  */
    // private optimizeTraversalWithNodeTypes(rootNode: SyntaxNode): SyntaxNode {
    //     // Em uma implementação completa, aplicaria otimizações do NodeTypeAnalyzer
    //     // antes de passar para o GraphBuilderService
    //     console.log(
    //         `[NodeTypeAnalyzer] Optimizing traversal for ${rootNode.type}`,
    //     );
    //     return rootNode; // Por enquanto, retorna o nó original
    // }

    protected collectImports(rootNode: SyntaxNode, filePath: string): void {
        const query = this.getQuery(QueryType.IMPORT);
        if (!query) {
            return;
        }

        const matches = query.matches(rootNode);
        if (matches.length === 0) {
            return;
        }

        for (const match of matches) {
            const captures = match.captures;

            const importCap = captures.find(
                (capture) => capture.name === 'import',
            );
            if (!importCap || !importCap.node) {
                continue;
            }

            const analysisNode = this.newAnalysisNode(
                importCap.node,
                NodeType.NODE_TYPE_IMPORT,
            );
            if (!analysisNode) {
                continue;
            }
            this.registerAnalysisNode(analysisNode);

            const originName = this.processImportOrigin(match, analysisNode);
            if (!originName) {
                continue;
            }
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
            if (!resolvedImport) {
                continue;
            }

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
        if (!originCapture || !originCapture.node) {
            return null;
        }
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
            if (aliasCapture) {
                first.symbol = '*';
                first.nodeId = this.mapNodeId(aliasCapture.node);
            }
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
        if (!query) {
            return;
        }

        const matches = query.matches(rootNode);
        if (matches.length === 0) {
            return;
        }

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
            type:
                queryToNodeTypeMap.get(type) ?? NodeType.NODE_TYPE_UNSPECIFIED,
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
        if (analysisNode) {
            this.addNameToAnalysisNode(analysisNode, objAnalysis.name);
        }

        return objAnalysis;
    }

    protected processObjCapture(
        capture: QueryCapture,
        objAnalysis: TypeAnalysis,
        methods: Method[],
        objProps: ObjectProperties,
    ): void {
        const node = capture.node;
        if (!node) {
            return;
        }

        const text = node.text;

        const lastMethod = methods[methods.length - 1];

        switch (capture.name) {
            case 'obj': {
                const analysisNode = this.newAnalysisNode(
                    node,
                    objAnalysis.type,
                );
                if (analysisNode) {
                    this.registerAnalysisNode(analysisNode);
                    objAnalysis.nodeId = this.mapNodeId(node);
                    objAnalysis.position = this.getNodeRange(node);
                }
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
                if (this.processExtraObjCapture) {
                    this.processExtraObjCapture(
                        capture,
                        objAnalysis,
                        methods,
                        objProps,
                    );
                }
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
        if (!node || !node.id) {
            return;
        }

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
        if (!query) {
            return;
        }

        const matches = query.matches(node);
        if (matches.length === 0) {
            return;
        }

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
        if (!method) {
            return;
        }
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
            if (objAnalysis.fields instanceof Map) {
                objAnalysis.fields.set(method.name, methodSignature);
            } else {
                objAnalysis.fields[method.name] = methodSignature;
            }

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
            if (!property.name) {
                continue;
            }
            if (objAnalysis.fields instanceof Map) {
                objAnalysis.fields.set(
                    property.name,
                    property.type || objProps.type || 'unknown',
                );
            } else {
                objAnalysis.fields[property.name] =
                    property.type || objProps.type || 'unknown';
            }
        }
    }

    protected processConstructor(
        objAnalysis: TypeAnalysis,
        methods: Method[],
    ): void {
        const constructor = methods.find(
            (method) => method.name === this.getConstructorName(),
        );
        if (!constructor) {
            return;
        }

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
        if (!query) {
            return;
        }

        const matches = query.matches(rootNode);
        if (matches.length === 0) {
            return;
        }

        for (const match of matches) {
            const captures = match.captures;
            if (captures.length === 0) {
                continue;
            }

            const method: Method = {
                nodeId: '',
                name: '',
                params: [],
                returnType: null,
                bodyNode: null,
                scope: [],
                position: {
                    startIndex: 0,
                    endIndex: 0,
                    startPosition: { row: 0, column: 0 },
                    endPosition: { row: 0, column: 0 },
                },
            };
            captures.forEach((capture) =>
                this.processFunctionCapture(capture, method),
            );
            if (!method.name) {
                continue;
            }

            const key = `${absolutePath}::${this.scopeToString(method.scope)}`;

            const params = method.params.map((param) => param.name);
            const returnType = method.returnType || 'unknown';
            const normalizedBody = method.bodyNode
                ? normalizeAST(method.bodyNode)
                : '';
            const signatureHash = normalizeSignature(params, returnType);
            const lines = method.bodyNode
                ? method.bodyNode.endPosition.row -
                  method.bodyNode.startPosition.row +
                  1
                : 0;
            const className =
                method.scope
                    .toReversed()
                    .find((scope) => scope.type === NodeType.NODE_TYPE_CLASS)
                    ?.name ||
                method.scope
                    .toReversed()
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

            let calls: Call[] = [];
            if (method.bodyNode) {
                calls = this.collectFunctionCalls(
                    method.bodyNode,
                    absolutePath,
                    method.scope,
                    className,
                );

                this.context.fileCalls.push(...calls);
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
                startLine: method.bodyNode?.startPosition?.row
                    ? method.bodyNode.startPosition.row + 1
                    : 0,
                endLine: method.bodyNode?.endPosition?.row
                    ? method.bodyNode.endPosition.row + 1
                    : 0,
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
        if (!node) {
            return;
        }

        switch (capture.name) {
            case 'func': {
                const analysisNode = this.newAnalysisNode(
                    node,
                    NodeType.NODE_TYPE_FUNCTION,
                );
                if (analysisNode) {
                    this.registerAnalysisNode(analysisNode);
                    method.nodeId = this.mapNodeId(node);
                    method.position = this.getNodeRange(node);
                }
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
        if (parentNode && analysisNode) {
            this.addChildToNode(parentNode, analysisNode);
        }
    }

    protected collectFunctionCalls(
        rootNode: SyntaxNode,
        absolutePath: string,
        scope: Scope[],
        className: string,
    ): Call[] {
        const query = this.getQuery(QueryType.FUNCTION_CALL);
        if (!query) {
            return [];
        }

        const matches = query.matches(rootNode);
        if (matches.length === 0) {
            return [];
        }

        const calls: Call[] = [];
        // Use a Set to track processed nodes to avoid reprocessing children of a matched chain
        const processedNodeIds = new Set<number>();

        for (const match of matches) {
            // The query should ideally capture the outermost call expression node
            const capture = match.captures[match.captures.length - 1];
            const node = capture?.node;

            if (!node || processedNodeIds.has(node.id)) {
                continue;
            }

            const chain = this.getMemberChain(node, new Map());
            if (chain.length === 0) {
                continue;
            }

            // Mark all nodes in this chain as processed so we don't create duplicate calls
            chain.forEach((link) => {
                const originalId = this.context.idMap.get(link.nodeId);
                if (originalId !== undefined) {
                    processedNodeIds.add(originalId);
                }
            });

            // The function being called is the last link in the chain
            const functionLink = chain[chain.length - 1];
            if (functionLink.type !== ChainType.FUNCTION) {
                continue;
            }

            const callerChain = chain.slice(0, chain.length - 1);

            let callerName = '';
            let targetFile: string;

            if (callerChain.length === 0) {
                // Case 1: Standalone function call, e.g., `bar()`
                callerName = '';
                targetFile = this.resolveTargetFile(
                    functionLink.name,
                    absolutePath,
                    scope,
                );
            } else {
                callerName = callerChain[0].name;
                if (callerName === this.getSelfAccessReference()) {
                    if (callerChain.length > 1) {
                        callerName = callerChain[1].name;
                    } else {
                        callerName = className || '';
                    }
                }

                targetFile = this.resolveTargetFile(
                    callerName,
                    absolutePath,
                    scope,
                );
            }

            calls.push({
                nodeId: functionLink.nodeId,
                function: functionLink.name,
                file: targetFile, // Best-effort resolution of the target file.
                caller: this.resolveAlias(callerName, scope), // The object/namespace the function is called on.
            });
        }

        return calls;
    }

    protected collectTypeAliases(
        rootNode: SyntaxNode,
        absolutePath: string,
    ): void {
        const query = this.getQuery(QueryType.TYPE_ALIAS);
        if (!query) {
            return;
        }

        const matches = query.matches(rootNode);
        if (matches.length === 0) {
            return;
        }

        for (const match of matches) {
            const captures = match.captures;
            if (captures.length === 0) {
                continue;
            }

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
                if (!node) {
                    continue;
                }

                const typeFields = [] as string[];

                switch (capture.name) {
                    case 'typeAlias': {
                        const analysisNode = this.newAnalysisNode(
                            node,
                            NodeType.NODE_TYPE_TYPE_ALIAS,
                        );
                        if (analysisNode) {
                            this.registerAnalysisNode(analysisNode);
                            typeAnalysis.nodeId = this.mapNodeId(node);
                            typeAnalysis.position = this.getNodeRange(node);
                        }
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
                        if (!typeAnalysis.fields) {
                            typeAnalysis.fields = {};
                        }
                        if (typeFields.length > 0) {
                            const fieldName = typeFields.pop() || '';
                            if (typeAnalysis.fields instanceof Map) {
                                typeAnalysis.fields.set(fieldName, typeName);
                            } else {
                                typeAnalysis.fields[fieldName] = typeName;
                            }
                        } else {
                            if (typeAnalysis.fields instanceof Map) {
                                typeAnalysis.fields.set(typeName, typeName);
                            } else {
                                typeAnalysis.fields[typeName] = typeName;
                            }
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
        if (!node) {
            return [];
        }

        const chain: CallChain[] = [];
        let currentNode: SyntaxNode | null = node;

        while (currentNode) {
            const cached = chains.get(currentNode.id);
            if (cached) {
                chain.push(...cached);
                break;
            }

            const processed = this.processChainNode(currentNode, chain);
            if (!processed) {
                return chain;
            }

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
        if (!field) {
            return;
        }

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
        let newScope: Scope[] = scope;
        const noMethodScopeIdx = findLastIndexOf(
            scope,
            (s) => s.type === NodeType.NODE_TYPE_FUNCTION,
        );
        if (noMethodScopeIdx !== -1) {
            newScope = scope.slice(0, scope.length - noMethodScopeIdx);
        }

        let typeName = this.context.instanceMapping.get(
            `${this.scopeToString(newScope)}::${instanceName}`,
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
        if (!node) {
            return null;
        }
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
        if (!node || !name) {
            return;
        }
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

        if (parent.id === child.id) {
            return;
        }

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

        if (parent.id === this.mapNodeId(child)) {
            return null;
        }

        const childNode = this.newAnalysisNode(child, type, name);
        if (childNode) {
            parent.children.push(childNode);
        }
        return childNode;
    }

    protected registerAnalysisNode(node: AnalysisNode): void {
        if (!node || !node.id) {
            return;
        }

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

    protected resolveAlias(alias: string, scope: Scope[]): string {
        let newScope: Scope[] = scope;
        const noMethodScopeIdx = findLastIndexOf(
            scope,
            (s) => s.type === NodeType.NODE_TYPE_FUNCTION,
        );
        if (noMethodScopeIdx !== -1) {
            newScope = scope.slice(0, scope.length - noMethodScopeIdx);
        }

        const resolved = this.context.instanceMapping.get(
            `${this.scopeToString(newScope)}::${alias}`,
        );

        if (resolved) {
            return resolved.split('::').pop() || alias;
        }
        return alias;
    }
}
