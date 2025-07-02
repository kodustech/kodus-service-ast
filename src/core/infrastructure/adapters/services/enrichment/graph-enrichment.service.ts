import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service';
import {
    EnrichedGraphNode,
    EnrichedGraphEdge,
    EnrichedGraph,
    NodeType,
    RelationshipType,
    CodeGraph,
} from '@kodus/kodus-proto/ast/v2';

@Injectable()
export class GraphEnrichmentService {
    private normalizedPathCache: Map<string, string>;
    private extractPathCache: Map<
        string,
        { filePath: string; identifier?: string }
    >;
    private addedNodes: Set<string>;
    private relationshipKeys: Record<string, boolean>;
    private nodes: EnrichedGraphNode[];
    private relationships: Map<string, EnrichedGraphEdge>;

    constructor(private readonly logger: PinoLoggerService) {}

    enrichGraph(data: CodeGraph): EnrichedGraph {
        this.normalizedPathCache = new Map();
        this.extractPathCache = new Map();
        this.nodes = [];
        this.relationships = new Map();
        this.addedNodes = new Set();
        this.relationshipKeys = {};

        this.processFiles(data);

        this.processTypes(data);
        this.processFunctions(data);
        this.processImports(data);

        this.processFunctionCalls(data);

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

                functionName = methodName;

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
                );
                if (!calledNode) {
                    this.logger.warn({
                        message: `Called node not found for ${call.function} in file ${calledFilePath}`,
                        context: GraphEnrichmentService.name,
                        metadata: {
                            function: call.function,
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
        if (this.normalizedPathCache.has(path)) {
            return this.normalizedPathCache.get(path);
        }

        const normalized = path.trim().replace(/\\/g, '/');
        this.normalizedPathCache.set(path, normalized);

        return normalized;
    }

    private addNode(node: EnrichedGraphNode) {
        if (!node || node.id === '') {
            return;
        }

        if (!this.addedNodes.has(node.id)) {
            this.addedNodes.add(node.id);
            this.nodes.push(node);
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

    private addRelationship(relationship: EnrichedGraphEdge) {
        if (
            !this.addedNodes.has(relationship.from) ||
            !this.addedNodes.has(relationship.to)
        ) {
            return;
        }

        const key = `${relationship.from}:${relationship.to}:${relationship.type}`;
        if (!this.relationshipKeys[key]) {
            this.relationships.set(key, relationship);
            this.relationshipKeys[key] = true;
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
                type.type === NodeType.NODE_TYPE_CLASS &&
                Array.isArray(type.implements) &&
                type.implements.some((impl: string) =>
                    impl.startsWith(interfacePath),
                ),
        );

        if (matchingClasses.length === 0) {
            return null;
        }

        const [, implClass] = matchingClasses[0];

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

        const [, func] = implMethodEntry;
        const normalizedFilePath = this.normalizePath(func.file);

        return {
            id: func.nodeId,
            filePath: normalizedFilePath,
        };
    }

    private findNode(name: string, filePath: string): EnrichedGraphNode | null {
        return (
            this.nodes.find(
                (node) =>
                    node.name === name &&
                    node.filePath === this.normalizePath(filePath),
            ) || null
        );
    }
}
