import { Inject, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service.js';
import {
    CodeGraph,
    EnrichedGraph,
    EnrichedGraphEdge,
    EnrichedGraphNode,
    NodeType,
    RelationshipType,
} from '@/shared/types/ast.js';

@Injectable()
export class GraphEnrichmentService {
    private normalizedPathCache?: Map<string, string>;
    private extractPathCache?: Map<
        string,
        { filePath: string; identifier?: string }
    >;
    private addedNodes?: Set<string>;
    private relationshipKeys?: Record<string, boolean>;
    private nodes?: EnrichedGraphNode[];
    private relationships?: Map<string, EnrichedGraphEdge>;

    // 🚀 OTIMIZAÇÃO REAL: Cache para findNode O(1) dentro da mesma execução
    private nodesByNameAndPath?: Map<string, EnrichedGraphNode>;

    constructor(
        @Inject(PinoLoggerService) private readonly logger: PinoLoggerService,
    ) {}

    enrichGraph(data: CodeGraph): EnrichedGraph {
        this.normalizedPathCache = new Map();
        this.extractPathCache = new Map();
        this.nodes = [];
        this.relationships = new Map();
        this.addedNodes = new Set();
        this.relationshipKeys = {};

        // 🚀 INICIALIZAR CACHE O(1) para findNode
        this.nodesByNameAndPath = new Map();

        this.processFiles(data);

        this.processTypes(data);
        this.processFunctions(data);
        this.processImports(data);

        this.processFunctionCalls(data);

        return {
            nodes: this.nodes || [],
            relationships: Array.from(this.relationships?.values() || []),
        };
    }

    private clearNormalizedPathCache(): void {
        this.normalizedPathCache?.clear();
    }

    private clearExtractPathCache(): void {
        this.extractPathCache?.clear();
    }

    private processFiles(data: CodeGraph) {
        data.files.forEach((fileData, filePath) => {
            const normalizedPath = this.normalizePath(filePath);

            fileData.nodes.forEach((node) => {
                this.addNode({
                    id: node.id,
                    name: node.name,
                    file: normalizedPath.split('/').pop() || '',
                    filePath: normalizedPath,
                    position: node.position,
                    type: node.type,
                });
            });
        });
    }

    private processTypes(data: CodeGraph) {
        data.types.forEach((type) => {
            const typeFilePath = this.normalizePath(type.file);

            type.implements?.forEach((iface) => {
                const { filePath, identifier } =
                    this.extractFilePathAndIdentifier(iface);

                const node = this.findNode(identifier || iface, filePath);
                if (!node) {
                    this.logger.warn({
                        message: `Node not found for interface ${iface} in file ${filePath}`,
                        context: GraphEnrichmentService.name,
                        metadata: {
                            type: type.type,
                            filePath,
                            identifier,
                        },
                    });
                    return;
                }

                this.addRelationship({
                    from: type.nodeId,
                    to: node.id,
                    type: RelationshipType.RELATIONSHIP_TYPE_IMPLEMENTS,
                    fromPath: typeFilePath,
                    toPath: filePath,
                });

                this.addRelationship({
                    from: node.id,
                    to: type.nodeId,
                    type: RelationshipType.RELATIONSHIP_TYPE_IMPLEMENTED_BY,
                    fromPath: filePath,
                    toPath: typeFilePath,
                });
            });

            type.extends?.forEach((baseClass: string) => {
                const { filePath, identifier } =
                    this.extractFilePathAndIdentifier(baseClass);

                const node = this.findNode(identifier || baseClass, filePath);
                if (!node) {
                    this.logger.warn({
                        message: `Node not found for base class ${baseClass} in file ${filePath}`,
                        context: GraphEnrichmentService.name,
                        metadata: {
                            type: type.type,
                            filePath,
                            identifier,
                        },
                    });
                    return;
                }
                this.addRelationship({
                    from: type.nodeId,
                    to: node.id,
                    type: RelationshipType.RELATIONSHIP_TYPE_EXTENDS,
                    fromPath: typeFilePath,
                    toPath: filePath,
                });

                this.addRelationship({
                    from: node.id,
                    to: type.nodeId,
                    type: RelationshipType.RELATIONSHIP_TYPE_EXTENDED_BY,
                    fromPath: filePath,
                    toPath: typeFilePath,
                });
            });
        });
    }

    private processFunctions(data: CodeGraph) {
        data.functions.forEach((func, funcKey) => {
            const className = func.className;
            let functionName = func.name;
            const filePath = this.normalizePath(func.file);

            if (!functionName) {
                const { identifier: methodName } =
                    this.extractFilePathAndIdentifier(funcKey);

                functionName = methodName || '';

                if (!functionName) {
                    this.logger.warn({
                        message: `Function name not found for ${funcKey}`,
                        context: GraphEnrichmentService.name,
                        metadata: { filePath, funcKey },
                    });
                    return;
                }
            }

            this.addNode({
                id: func.nodeId,
                name: functionName,
                file: filePath.split('/').pop() || '',
                filePath: filePath,
                position: func.position,
                type: NodeType.NODE_TYPE_FUNCTION,
            });

            this.addNodeOwner(func.nodeId, className, filePath);

            const classNode = this.findNode(className, filePath);

            if (classNode) {
                this.addRelationship({
                    from: classNode.id,
                    to: func.nodeId,
                    type: RelationshipType.RELATIONSHIP_TYPE_HAS_METHOD,
                    fromPath: classNode.filePath,
                    toPath: filePath,
                });
            }
        });
    }

    private processImports(data: CodeGraph) {
        data.files.forEach((fileData, filePath) => {
            if (!fileData.imports || !fileData.imports.length) {
                return;
            }

            const normalizedPath = this.normalizePath(filePath);

            fileData.imports.forEach((importedFile) => {
                const { filePath: importedFilePath, identifier } =
                    this.extractFilePathAndIdentifier(importedFile);

                const normalizedImportedPath =
                    this.normalizePath(importedFilePath);

                const node = this.findNode(
                    identifier || importedFile,
                    normalizedImportedPath,
                );
                if (!node) {
                    this.logger.warn({
                        message: `Node not found for imported identifier ${identifier || importedFile} in file ${normalizedImportedPath}`,
                        context: GraphEnrichmentService.name,
                        metadata: {
                            filePath: normalizedPath,
                            importedFile,
                            identifier,
                        },
                    });
                    return;
                }

                this.addRelationship({
                    from: node.id,
                    to: node.id,
                    type: RelationshipType.RELATIONSHIP_TYPE_IMPORTS,
                    fromPath: normalizedPath,
                    toPath: normalizedImportedPath,
                });
            });
        });
    }

    private processFunctionCalls(data: CodeGraph) {
        for (const [key, func] of data.functions.entries()) {
            if (!func.nodeId || func.nodeId === '') {
                continue;
            }

            const { filePath } = this.extractFilePathAndIdentifier(key);
            const normalizedFilePath = this.normalizePath(filePath);

            for (const call of func.calls || []) {
                if (!call.function || !call.file) {
                    continue;
                }

                const { filePath: calledFilePath } =
                    this.extractFilePathAndIdentifier(call.file);
                const normalizedCalledFilePath =
                    this.normalizePath(calledFilePath);

                const calledNode = this.findNode(
                    call.function,
                    normalizedCalledFilePath,
                    call.caller,
                );

                if (!calledNode) {
                    this.logger.warn({
                        message: `Called node not found for ${call.function} in file ${calledFilePath}`,
                        context: GraphEnrichmentService.name,
                        metadata: {
                            function: call.function,
                            caller: call.caller,
                            filePath: normalizedFilePath,
                            calledFilePath: normalizedCalledFilePath,
                        },
                    });
                    continue;
                }

                this.addRelationship({
                    from: func.nodeId,
                    to: calledNode.id,
                    type: RelationshipType.RELATIONSHIP_TYPE_CALLS,
                    fromPath: normalizedFilePath,
                    toPath: normalizedCalledFilePath,
                });

                const implMethod = this.findImplementation(
                    call.file,
                    call.function,
                    data,
                );
                if (implMethod) {
                    this.addRelationship({
                        from: func.nodeId,
                        to: implMethod.id,
                        type: RelationshipType.RELATIONSHIP_TYPE_CALLS_IMPLEMENTATION,
                        fromPath: normalizedFilePath,
                        toPath: implMethod.filePath,
                    });
                }
            }
        }
    }

    private normalizePath(path: string): string {
        const cached = this.normalizedPathCache?.get(path);
        if (cached !== undefined) {
            return cached;
        }

        const normalized = path.trim().replace(/\\/g, '/');
        this.normalizedPathCache?.set(path, normalized);

        return normalized;
    }

    private addNode(node: EnrichedGraphNode) {
        if (!node || node.id === '') {
            return;
        }

        if (!this.addedNodes?.has(node.id)) {
            this.addedNodes?.add(node.id);
            this.nodes?.push(node);

            // 🚀 POPULAR CACHE O(1) para findNode
            const key = `${node.name}|${node.filePath}`;
            this.nodesByNameAndPath?.set(key, node);
        }
    }

    private addNodeOwner(
        nodeId: string,
        owner: string,
        filePath: string,
    ): void {
        const existingNode = this.nodes?.find((n) => n.id === nodeId);
        if (existingNode) {
            existingNode.owner = owner;
            existingNode.filePath = this.normalizePath(filePath);
        } else {
            this.logger.warn({
                message: `Node not found for ID ${nodeId} when adding owner ${owner}`,
                context: GraphEnrichmentService.name,
                metadata: { filePath, nodeId, owner },
            });
        }
    }

    private extractFilePathAndIdentifier(fullPath: string): {
        filePath: string;
        identifier?: string;
    } {
        const cached = this.extractPathCache?.get(fullPath);
        if (cached !== undefined) {
            return cached;
        }

        const match = fullPath.match(/^(.+\.[a-zA-Z0-9]+)::(.+)$/);

        const result = match
            ? { filePath: match[1], identifier: match[2] }
            : { filePath: fullPath };

        this.extractPathCache?.set(fullPath, result);

        return result;
    }

    private addRelationship(relationship: EnrichedGraphEdge) {
        if (
            !this.addedNodes?.has(relationship.from) ||
            !this.addedNodes?.has(relationship.to)
        ) {
            return;
        }

        const key = `${relationship.from}:${relationship.to}:${relationship.type}`;
        if (!this.relationshipKeys?.[key]) {
            this.relationships?.set(key, relationship);
            if (this.relationshipKeys) {
                this.relationshipKeys[key] = true;
            }
        }
    }

    private inferClassName(filePath: string, data: CodeGraph): string | null {
        if (data.files instanceof Map) {
            return this.inferClassNameFromMap(filePath, data);
        }

        const foundClass = Array.from(data.types.values()).find(
            (type) =>
                type &&
                type.file === filePath &&
                type.type === NodeType.NODE_TYPE_CLASS,
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
        if (!fileData) {
            return null;
        }

        const className = fileData.className?.[0] || 'undefined';

        return `${className}.${functionName}`;
    }

    private findImplementation(
        interfacePath: string,
        methodName: string,
        data: CodeGraph,
    ): { id: string; filePath: string } | null {
        // 🚀 OTIMIZAÇÃO: Iterar diretamente em vez de Array.from()
        let matchingClass: any = null;
        for (const [, type] of data.types) {
            if (
                type.type === NodeType.NODE_TYPE_CLASS &&
                Array.isArray(type.implements) &&
                type.implements.some((impl: string) =>
                    impl.startsWith(interfacePath),
                )
            ) {
                matchingClass = type;
                break; // Pegar o primeiro match
            }
        }

        if (!matchingClass || !matchingClass.name) {
            return null;
        }

        // 🚀 OTIMIZAÇÃO: Buscar função diretamente em vez de Array.from()
        for (const [, func] of data.functions) {
            if (
                func.className === matchingClass.name &&
                func.name === methodName
            ) {
                const normalizedFilePath = this.normalizePath(func.file);
                return {
                    id: func.nodeId,
                    filePath: normalizedFilePath,
                };
            }
        }

        return null;
    }

    private findNode(
        name: string,
        filePath: string,
        caller?: string,
    ): EnrichedGraphNode | null {
        const normalizedFilePath = this.normalizePath(filePath);

        // 🚀 OTIMIZAÇÃO: O(1) lookup usando cache
        if (caller === undefined || caller === null) {
            const key = `${name}|${normalizedFilePath}`;
            return this.nodesByNameAndPath?.get(key) || null;
        }

        // 🚀 Para casos com caller, ainda precisamos filtrar, mas otimizamos
        const key = `${name}|${normalizedFilePath}`;
        const candidateNode = this.nodesByNameAndPath?.get(key);

        if (!candidateNode) {
            return null;
        }

        // Contextual match: use the caller to disambiguate.
        if (caller) {
            // A caller was provided (e.g., 'Foo'). We are looking for a method.
            // The node's owner must match the caller.
            return candidateNode.owner === caller ? candidateNode : null;
        } else {
            // No caller was provided. We are looking for a standalone function.
            // The node must NOT have an owner.
            return !candidateNode.owner ? candidateNode : null;
        }
    }
}
