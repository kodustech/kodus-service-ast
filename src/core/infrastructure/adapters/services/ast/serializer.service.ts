import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service';
import { CodeGraph } from '@/core/domain/ast/types/code-graph';
import {
    CodeGraph as SerializedCodeGraph,
    QueryType as SerializedQueryType,
    EnrichGraph as SerializedEnrichGraph,
    EnrichGraphNode as SerializedEnrichGraphNode,
    NodeType as SerializedNodeType,
    EnrichGraphEdge as SerializedEnrichGraphEdge,
    RelationshipType as SerializedRelationshipType,
} from '@kodus/kodus-proto/v2';
import { QueryType } from './parsers/query';
import {
    EnrichGraph,
    NodeType,
    RelationshipType,
} from '@/core/domain/ast/types/encriched-graph';

@Injectable()
export class SerializerService {
    constructor(private readonly logger: PinoLoggerService) {}

    serializeCodeGraph(graph: CodeGraph): SerializedCodeGraph {
        const files = Object.fromEntries(graph.files.entries());
        const functions = Object.fromEntries(graph.functions.entries());
        const types = {};

        for (const [key, type] of graph.types.entries()) {
            types[key] = {
                ...type,
                type: this.serializeQueryType(type.type),
            };
        }

        return {
            files: files,
            functions: functions,
            types: types,
        };
    }

    serializeEnrichedGraph(graph: EnrichGraph): SerializedEnrichGraph {
        const nodes = graph.nodes.map(
            (n) =>
                ({
                    ...n,
                    type: this.serializeNodeType(n.type),
                }) as SerializedEnrichGraphNode,
        );

        const relationships = graph.relationships.map(
            (r) =>
                ({
                    ...r,
                    type: this.serializeRelationshipType(r.type),
                }) as SerializedEnrichGraphEdge,
        );

        return {
            nodes,
            relationships,
        };
    }

    private serializeQueryType(type: QueryType): SerializedQueryType {
        switch (type) {
            case QueryType.CLASS_QUERY:
                return SerializedQueryType.QUERY_TYPE_CLASS;
            case QueryType.INTERFACE_QUERY:
                return SerializedQueryType.QUERY_TYPE_INTERFACE;
            case QueryType.ENUM_QUERY:
                return SerializedQueryType.QUERY_TYPE_ENUM;
            case QueryType.TYPE_ALIAS_QUERY:
                return SerializedQueryType.QUERY_TYPE_TYPE_ALIAS;
            case QueryType.FUNCTION_QUERY:
                return SerializedQueryType.QUERY_TYPE_FUNCTION;
            case QueryType.FUNCTION_CALL_QUERY:
                return SerializedQueryType.QUERY_TYPE_FUNCTION_CALL;
            case QueryType.FUNCTION_PARAMETERS_QUERY:
                return SerializedQueryType.QUERY_TYPE_FUNCTION_PARAMETERS;
            case QueryType.IMPORT_QUERY:
                return SerializedQueryType.QUERY_TYPE_IMPORT;
            default:
                return SerializedQueryType.QUERY_TYPE_UNSPECIFIED;
        }
    }

    private serializeNodeType(type: NodeType): SerializedNodeType {
        switch (type) {
            case NodeType.CLASS:
                return SerializedNodeType.NODE_TYPE_CLASS;
            case NodeType.METHOD:
                return SerializedNodeType.NODE_TYPE_METHOD;
            case NodeType.FUNCTION:
                return SerializedNodeType.NODE_TYPE_FUNCTION;
            case NodeType.INTERFACE:
                return SerializedNodeType.NODE_TYPE_INTERFACE;
            default:
                return SerializedNodeType.NODE_TYPE_UNSPECIFIED;
        }
    }

    private serializeRelationshipType(
        type: RelationshipType,
    ): SerializedRelationshipType {
        switch (type) {
            case RelationshipType.CALLS:
                return SerializedRelationshipType.RELATIONSHIP_TYPE_CALLS;
            case RelationshipType.CALLS_IMPLEMENTATION:
                return SerializedRelationshipType.RELATIONSHIP_TYPE_CALLS_IMPLEMENTATION;
            case RelationshipType.HAS_METHOD:
                return SerializedRelationshipType.RELATIONSHIP_TYPE_HAS_METHOD;
            case RelationshipType.IMPORTS:
                return SerializedRelationshipType.RELATIONSHIP_TYPE_IMPORTS;
            case RelationshipType.IMPLEMENTS:
                return SerializedRelationshipType.RELATIONSHIP_TYPE_IMPLEMENTS;
            case RelationshipType.IMPLEMENTED_BY:
                return SerializedRelationshipType.RELATIONSHIP_TYPE_IMPLEMENTED_BY;
            case RelationshipType.EXTENDS:
                return SerializedRelationshipType.RELATIONSHIP_TYPE_EXTENDS;
            default:
                return SerializedRelationshipType.RELATIONSHIP_TYPE_UNSPECIFIED;
        }
    }
}
