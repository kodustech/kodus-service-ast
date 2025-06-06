import { CodeGraph, FileAnalysis } from '@/core/domain/ast/types/code-graph';
import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service';
import {
    EnrichGraphNode,
    EnrichGraphEdge,
    EnrichGraph,
    NodeType,
    RelationshipType,
} from '@/core/domain/ast/types/encriched-graph';

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

        this.processTypes(data);
        this.processFunctions(data);
        this.processImports(data);

        this.processFunctionCalls(data);
        this.processInheritance(data);

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

    private processTypes(data: CodeGraph) {
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

        data.types.forEach((type, key) => {
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
                        const { filePath, identifier } =
                            this.extractFilePathAndIdentifier(iface);
                        if (identifier && this.addedNodes[identifier]) {
                            this.addRelationship(
                                type.name,
                                identifier,
                                RelationshipType.IMPLEMENTS,
                                type.file,
                                filePath,
                            );
                        }
                    });

                    type.extends?.forEach((baseClass: string) => {
                        const { filePath, identifier } =
                            this.extractFilePathAndIdentifier(baseClass);
                        if (identifier && this.addedNodes[identifier]) {
                            this.addRelationship(
                                type.name,
                                identifier,
                                RelationshipType.EXTENDS,
                                type.file,
                                filePath,
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

    private processFunctions(data: CodeGraph) {
        data.functions.forEach((func, funcKey) => {
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
        });
    }

    private processImports(data: CodeGraph) {
        for (const [filePath, fileData] of data.files) {
            this.processFileImports(filePath, fileData, data);
        }
    }

    private processFileImports(
        filePath: string,
        fileData: FileAnalysis,
        data: CodeGraph,
    ) {
        if (!fileData.imports || !fileData.imports.length) {
            return;
        }

        const normalizedFrom = this.normalizePath(filePath);
        const className = fileData.className?.[0];

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
    }

    private processFunctionCalls(data: CodeGraph) {
        for (const [key, func] of data.functions.entries()) {
            const { filePath } = this.extractFilePathAndIdentifier(key);

            if (!func.className || !func.name) {
                continue;
            }

            const methodId = `${func.className}.${func.name}`;

            for (const call of func.calls || []) {
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

    private processInheritance(data: CodeGraph) {
        data.types.forEach((type) => {
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
                            filePath,
                        );
                    }
                });
            }
        });
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

        const match = fullPath.match(/^(.+\.[a-zA-Z0-9]+)::(.+)$/);

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

    private inferClassName(filePath: string, data: CodeGraph): string | null {
        if (data.files instanceof Map) {
            return this.inferClassNameFromMap(filePath, data);
        }

        const foundClass = Array.from(data.types.values()).find(
            (type) => type && type.file === filePath && type.type === 'class',
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
        data: CodeGraph,
    ): string | null {
        const fileData = data.files.get(filePath);
        if (!fileData) return null;

        const className = fileData.className?.[0] || 'undefined';

        return `${className}.${functionName}`;
    }

    private findImplementation(
        interfacePath: string,
        methodName: string,
        data: CodeGraph,
    ): { id: string; filePath: string } | null {
        const matchingClasses = Array.from(data.types.entries()).filter(
            ([, type]) =>
                type.type === 'class' &&
                Array.isArray(type.implements) &&
                type.implements.some((impl: string) =>
                    impl.startsWith(`${interfacePath}:`),
                ),
        );

        if (matchingClasses.length === 0) {
            return null;
        }

        const [, implClass] = matchingClasses[0] as [string, { name: string }];

        if (!implClass.name) {
            return null;
        }

        const implMethodEntry = Array.from(data.functions.entries()).find(
            ([, func]) =>
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
