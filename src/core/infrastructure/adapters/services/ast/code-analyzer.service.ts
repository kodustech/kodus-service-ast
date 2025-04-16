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
    }

    private processFunctions(data: any) {
        Object.entries(data.functions || {}).forEach(
            ([funcKey, func]: [string, any]) => {
                let className = func.className;
                let functionName = func.name;
                const filePath = func.file;

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

                const methodId = `${className}.${functionName}`;

                if (!this.addedNodes[methodId]) {
                    this.addNode(
                        methodId,
                        NodeType.METHOD,
                        filePath.split('/').pop() || '',
                        filePath,
                    );
                }

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

        if (data.files instanceof Map) {
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
            const typedFunc = func as FunctionData;

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
            return;
        }
        if (!this.addedNodes[id]) {
            this.nodes.push({ id, type, file, filePath });
            this.addedNodes[id] = true;
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
        if (data.files instanceof Map) {
            return this.inferClassNameFromMap(filePath, data);
        }

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
        const normalizedPath = this.normalizePath(filePath);

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
        const fileData = data.files?.[filePath];
        if (!fileData) return null;

        const className = fileData.className?.[0] || 'undefined';

        return `${className}.${functionName}`;
    }

    private findImplementation(
        interfacePath: string,
        methodName: string,
        data: any,
    ): { id: string; filePath: string } | null {
        const matchingClasses = Object.entries(data.types || {}).filter(
            ([, type]: [string, any]) =>
                type.type === 'class' &&
                Array.isArray(type.implements) &&
                type.implements.some((impl: string) =>
                    impl.startsWith(`${interfacePath}:`),
                ),
        );

        if (matchingClasses.length === 0) {
            return null;
        }

        const [implClassPath, implClass] = matchingClasses[0] as [
            string,
            { name: string },
        ];

        if (!implClass.name) {
            return null;
        }

        const implMethodEntry = Object.entries(data.functions || {}).find(
            ([, func]: [string, any]) =>
                func.className === implClass.name && func.name === methodName,
        );

        if (!implMethodEntry) {
            return null;
        }

        const [, func] = implMethodEntry as [string, { file: string }];

        return {
            id: `${implClass.name}.${methodName}`,
            filePath: func.file,
        };
    }
}
