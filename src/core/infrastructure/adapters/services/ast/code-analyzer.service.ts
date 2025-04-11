/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CodeGraph } from '@/core/domain/ast/contracts/CodeGraph';
import { Injectable } from '@nestjs/common';
import { SyntaxNode } from 'tree-sitter';
import { PinoLoggerService } from '../logger/pino.service';

export enum NodeType {
    CLASS = 'CLASS',
    METHOD = 'METHOD',
    FUNCTION = 'FUNCTION',
    INTERFACE = 'INTERFACE',
}

interface FunctionData {
    className?: string;
    name?: string;
    calls?: { function: string; file: string }[];
    file: string;
}

interface EnrichGraphNode {
    id: string;
    type: NodeType;
    file: string;
    filePath: string;
}

export enum RelationshipType {
    CALLS = 'CALLS',
    CALLS_IMPLEMENTATION = 'CALLS_IMPLEMENTATION',
    HAS_METHOD = 'HAS_METHOD',
    IMPORTS = 'IMPORTS',
    IMPLEMENTS = 'IMPLEMENTS',
    IMPLEMENTED_BY = 'IMPLEMENTED_BY',
    EXTENDS = 'EXTENDS',
}

interface ImpactedNode {
    id: string;
    type: string;
    severity: string;
    level: number;
    filePath: string;
    calledBy?: string[];
    importedBy?: string[];
}

interface EnrichGraphEdge {
    from: string;
    to: string;
    type: RelationshipType;
    fromPath: string;
    toPath: string;
}

export interface EnrichGraph {
    nodes: EnrichGraphNode[];
    relationships: EnrichGraphEdge[];
}

export interface ScopeAnalysis {
    variables: string[];
    functions: string[];
    dependencies: string[];
}

export interface ComplexityAnalysis {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    details: {
        conditionals: number;
        loops: number;
        switches: number;
        catches: number;
        logicalOperators: number;
        recursion: boolean;
    };
}

export interface ImpactResult {
    function: string;
    impact: {
        summary: any;
        groupedByLevel: Record<string, ImpactedNode[]>;
    };
}

export interface FunctionsAffect {
    functionName: string;
    filePath: string;
    functionBody: string;
}

export interface FunctionsAffectResult {
    oldFunction: string;
    newFunction: string;
    functionsAffect: FunctionsAffect[];
}

export interface FunctionSimilarity {
    functionName: string;
    similarFunctions: [];
}

export interface ChangeResult {
    added: FunctionResult[];
    modified: FunctionResult[];
    deleted: FunctionResult[];
}

export interface FunctionResult {
    name: string;
    fullName: string;
    functionHash: string;
    signatureHash: string;
    node: SyntaxNode;
    fullText: string;
    lines: number;
}

@Injectable()
export class CodeAnalyzerService {
    private normalizedPathCache = new Map<string, string>();
    private extractPathCache = new Map<
        string,
        { filePath: string; identifier?: string }
    >();
    private addedNodes: Record<string, boolean> = {};
    private relationshipKeys: Record<string, boolean> = {};
    private nodes: EnrichGraphNode[] = [];
    private relationships = new Map<string, EnrichGraphEdge>();

    constructor(private readonly logger: PinoLoggerService) {}

    enrichGraph(data: CodeGraph): EnrichGraph {
        this.clearNormalizedPathCache();
        this.clearExtractPathCache();

        this.nodes = [];
        this.relationships.clear();
        this.addedNodes = {};
        this.relationshipKeys = {};

        console.log('🔄 Processando classes e interfaces...');
        console.log('🔄 enrichGraph - Tipos disponíveis:', data.types.size);
        console.log(
            '🔄 enrichGraph - Funções disponíveis:',
            data.functions.size,
        );
        console.log('🔄 enrichGraph - Arquivos disponíveis:', data.files.size);

        // Verificar estrutura de uma chave de tipo para debug
        if (data.types.size > 0) {
            const sampleTypeEntry = Array.from(data.types.entries())[0];
            console.log('🔄 Exemplo de chave de tipo:', sampleTypeEntry[0]);
            console.log('🔄 Valor do tipo:', sampleTypeEntry[1]);
        }

        // Converter Maps para objetos para compatibilidade com os métodos existentes
        const dataAsObjects = {
            types: Object.fromEntries(data.types),
            functions: Object.fromEntries(data.functions),
            files: Object.fromEntries(data.files),
        };

        this.processTypes(dataAsObjects);
        this.processFunctions(dataAsObjects);
        this.processImports(dataAsObjects);

        this.processFunctionCalls(dataAsObjects);
        this.processInheritance(dataAsObjects);

        console.log('✅ Processamento de relacionamentos concluído!');
        console.log('✅ enrichGraph - Nós processados:', this.nodes.length);
        console.log(
            '✅ enrichGraph - Relacionamentos processados:',
            this.relationships.size,
        );

        return {
            nodes: this.nodes,
            relationships: Array.from(this.relationships.values()),
        };
    }

    private clearNormalizedPathCache(): void {
        this.normalizedPathCache.clear();
    }

    private clearExtractPathCache(): void {
        this.extractPathCache.clear();
    }

    private processTypes(data: { types?: Record<string, any> }) {
        console.log('🔄 Processando classes e interfaces...');

        const normalizedTypes = new Map<
            string,
            {
                name: string;
                type: string;
                file: string;
                implements?: string[];
                extends?: string[];
                implementedBy?: string[];
            }
        >();

        Object.entries(data.types || {}).forEach(([key, type]) => {
            if (
                typeof type === 'object' &&
                type.name &&
                type.type &&
                type.file
            ) {
                const normalizedKey = this.normalizePath(key);
                normalizedTypes.set(normalizedKey, type);

                this.addNode(
                    type.name,
                    type.type === 'interface'
                        ? NodeType.INTERFACE
                        : NodeType.CLASS,
                    type.file.split('/').pop() || '',
                    type.file,
                );

                if (type.type === 'class') {
                    type.implements?.forEach((iface: string) => {
                        const { identifier } =
                            this.extractFilePathAndIdentifier(iface);
                        if (identifier && this.addedNodes[identifier]) {
                            this.addRelationship(
                                type.name,
                                identifier,
                                RelationshipType.IMPLEMENTS,
                                type.file,
                                iface,
                            );
                        }
                    });

                    type.extends?.forEach((baseClass: string) => {
                        const { identifier } =
                            this.extractFilePathAndIdentifier(baseClass);
                        if (identifier && this.addedNodes[identifier]) {
                            this.addRelationship(
                                type.name,
                                identifier,
                                RelationshipType.EXTENDS,
                                type.file,
                                baseClass,
                            );
                        }
                    });
                } else if (type.type === 'interface') {
                    type.implementedBy?.forEach((cls: string) => {
                        const { identifier } =
                            this.extractFilePathAndIdentifier(cls);
                        if (identifier && this.addedNodes[identifier]) {
                            this.addRelationship(
                                identifier,
                                type.name,
                                RelationshipType.IMPLEMENTED_BY,
                                type.file,
                                cls,
                            );
                        }
                    });
                }
            }
        });

        console.log('✅ Processamento de tipos concluído!');
    }

    private processFunctions(data: any) {
        console.log('🔍 processFunctions() iniciado');

        Object.entries(data.functions || {}).forEach(
            ([funcKey, func]: [string, any]) => {
                let className = func.className;
                let functionName = func.name;
                const filePath = func.file;

                // 🔹 Se `className` estiver ausente, tenta inferir a classe pelo arquivo
                if (!className) {
                    className = this.inferClassName(filePath, data);

                    if (!className) {
                        return;
                    }
                }

                if (!functionName) {
                    const { identifier: methodName } =
                        this.extractFilePathAndIdentifier(funcKey);

                    functionName = methodName;

                    return;
                }

                // Criar identificador do método
                const methodId = `${className}.${functionName}`;

                if (!this.addedNodes[methodId]) {
                    this.addNode(
                        methodId,
                        NodeType.METHOD,
                        filePath.split('/').pop() || '',
                        filePath,
                    );
                }

                // Relacionar método com a classe
                if (this.addedNodes[methodId]) {
                    this.addRelationship(
                        className,
                        methodId,
                        RelationshipType.HAS_METHOD,
                        filePath,
                        filePath,
                    );
                }
            },
        );

        console.log('✅ Processamento de funções concluído!');
    }

    private processImports(data: any) {
        for (const [filePath, fileData] of Object.entries(data.files || {})) {
            this.processFileImports(filePath, fileData, data);
        }
    }

    private processFileImports(filePath: string, fileData: any, data: any) {
        if (!fileData.imports || !fileData.imports.length) {
            return;
        }

        const normalizedFrom = this.normalizePath(filePath);
        const className = fileData.className?.[0];

        // Verificar se data é um CodeGraph (com Maps) ou um objeto
        if (data.files instanceof Map) {
            // Obter os dados do arquivo importado do Map
            const importedFileData = data.files.get(normalizedFrom);
            if (importedFileData && importedFileData.className) {
                const importedClassName = importedFileData.className[0];

                this.addRelationship(
                    className,
                    importedClassName,
                    RelationshipType.IMPORTS,
                    normalizedFrom,
                    normalizedFrom,
                );
            }
        } else {
            // Versão para objetos
            const importedFileData = data.files?.[normalizedFrom];
            if (importedFileData && importedFileData.className) {
                const importedClassName = importedFileData.className[0];

                this.addRelationship(
                    className,
                    importedClassName,
                    RelationshipType.IMPORTS,
                    normalizedFrom,
                    normalizedFrom,
                );
            }
        }
    }

    private processFunctionCalls(data: any) {
        for (const [funcKey, func] of Object.entries(data.functions || {})) {
            const typedFunc = func as FunctionData; // ✅ cast explícito

            const { filePath } = this.extractFilePathAndIdentifier(funcKey);

            if (!typedFunc.className || !typedFunc.name) {
                continue;
            }

            const methodId = `${typedFunc.className}.${typedFunc.name}`;

            for (const call of typedFunc.calls || []) {
                if (!call.function || !call.file) {
                    continue;
                }

                const { filePath: calledFilePath } =
                    this.extractFilePathAndIdentifier(call.file);

                // Processamento CALLS (Chamadas diretas)
                const calledId = this.findMethodId(
                    call.file,
                    call.function,
                    data,
                );

                if (calledId) {
                    this.addRelationship(
                        methodId,
                        calledId,
                        RelationshipType.CALLS,
                        filePath,
                        calledFilePath,
                    );
                }

                // Processamento CALLS_IMPLEMENTATION (Chamadas para interfaces implementadas)
                const implMethod = this.findImplementation(
                    call.file,
                    call.function,
                    data,
                );
                if (implMethod) {
                    this.addRelationship(
                        methodId,
                        implMethod.id,
                        RelationshipType.CALLS_IMPLEMENTATION,
                        filePath,
                        implMethod.filePath,
                    );
                }
            }
        }
    }

    private processInheritance(data: any) {
        console.log('🔍 processInheritance() iniciado');

        Object.entries(data.types || {}).forEach(
            ([key, type]: [string, any]) => {
                if (
                    (type.type === 'class' && type.extends) ||
                    (type.type === 'interface' && type.extends)
                ) {
                    type.extends.forEach((baseClass: string) => {
                        if (this.addedNodes[type.name]) {
                            const { filePath, identifier } =
                                this.extractFilePathAndIdentifier(baseClass);

                            this.addRelationship(
                                type.name,
                                identifier,
                                RelationshipType.EXTENDS,
                                type.file,
                                identifier,
                            );
                        }
                    });
                }
            },
        );
    }

    private normalizePath(path: string): string {
        if (this.normalizedPathCache.has(path)) {
            return this.normalizedPathCache.get(path);
        }

        const normalized = path.trim().replace(/\\/g, '/');
        this.normalizedPathCache.set(path, normalized);

        return normalized;
    }

    private addNode(
        id: string,
        type: EnrichGraphNode['type'],
        file: string,
        filePath: string,
    ) {
        if (!id || id === 'undefined') {
            console.warn(
                `⚠️ Tentativa de adicionar nó com ID inválido: ${filePath}`,
            );
            return;
        }
        if (!this.addedNodes[id]) {
            // ✅ Agora correto!
            this.nodes.push({ id, type, file, filePath });
            this.addedNodes[id] = true; // ✅ Marca que já foi adicionado
        }
    }

    private extractFilePathAndIdentifier(fullPath: string): {
        filePath: string;
        identifier?: string;
    } {
        if (this.extractPathCache.has(fullPath)) {
            return this.extractPathCache.get(fullPath);
        }

        const match = fullPath.match(/^(.+\.[a-zA-Z0-9]+):(.+)$/);

        const result = match
            ? { filePath: match[1], identifier: match[2] }
            : { filePath: fullPath };

        this.extractPathCache.set(fullPath, result);

        return result;
    }

    private addRelationship(
        from: string,
        to: string,
        type: RelationshipType,
        fromPath: string,
        toPath: string,
    ) {
        if (!this.addedNodes[from] || !this.addedNodes[to]) {
            return;
        }

        const key = `${from}:${to}:${type}`;
        if (!this.relationshipKeys[key]) {
            this.relationships.set(key, { from, to, type, fromPath, toPath });
            this.relationshipKeys[key] = true;
        }
    }

    private inferClassName(filePath: string, data: any): string | null {
        // Se data for um CodeGraph (com Maps)
        if (data.files instanceof Map) {
            return this.inferClassNameFromMap(filePath, data);
        }

        // Versão original para objetos
        const foundClass = Object.values(data.types || {}).find(
            (type: any) =>
                type && type.file === filePath && type.type === 'class',
        ) as { name?: string } | undefined;

        return foundClass?.name || null;
    }

    private inferClassNameFromMap(
        filePath: string,
        data: CodeGraph,
    ): string | null {
        // Normalizar o caminho para garantir consistência
        const normalizedPath = this.normalizePath(filePath);

        // Obter os dados do arquivo
        const fileData = data.files.get(normalizedPath);
        if (!fileData || !fileData.className || !fileData.className.length) {
            return null;
        }

        return fileData.className[0];
    }

    private findMethodId(
        filePath: string,
        functionName: string,
        data: any,
    ): string | null {
        // Tenta encontrar a classe ou interface no arquivo
        const fileData = data.files?.[filePath];
        if (!fileData) return null;

        // Procura pela classe ou interface que define esse método
        const className = fileData.className?.[0] || 'undefined';

        return `${className}.${functionName}`;
    }

    private findImplementation(
        interfacePath: string,
        methodName: string,
        data: any,
    ): { id: string; filePath: string } | null {
        console.log(
            `🔎 Buscando implementação para ${interfacePath}.${methodName}`,
        );

        // Normalizar interfacePath removendo o nome da interface (se necessário)
        const matchingClasses = Object.entries(data.types || {}).filter(
            ([, type]: [string, any]) =>
                type.type === 'class' &&
                Array.isArray(type.implements) &&
                type.implements.some((impl: string) =>
                    impl.startsWith(`${interfacePath}:`),
                ), // Verifica se começa com o caminho
        );

        if (matchingClasses.length === 0) {
            console.error(
                `❌ ERRO: Nenhuma implementação encontrada para ${interfacePath}`,
            );
            return null;
        }

        // Pegar a primeira classe que implementa a interface
        const [implClassPath, implClass] = matchingClasses[0] as [
            string,
            { name: string },
        ];

        if (!implClass.name) {
            console.error(
                `❌ ERRO: Implementação sem nome em ${implClassPath}`,
            );
            return null;
        }

        // Buscar o método dentro da classe implementada
        const implMethodEntry = Object.entries(data.functions || {}).find(
            ([, func]: [string, any]) =>
                func.className === implClass.name && func.name === methodName,
        );

        if (!implMethodEntry) {
            console.error(
                `❌ ERRO: Método ${methodName} não encontrado em ${implClass.name}`,
            );
            return null;
        }

        const [, func] = implMethodEntry as [string, { file: string }];

        return {
            id: `${implClass.name}.${methodName}`,
            filePath: func.file,
        };
    }
}
