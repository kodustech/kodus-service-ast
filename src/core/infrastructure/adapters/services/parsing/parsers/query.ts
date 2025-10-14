import { NodeType } from '@/shared/types/ast.js';

export enum QueryType {
    IMPORT = 'import',
    CLASS = 'class',
    INTERFACE = 'interface',
    ENUM = 'enum',
    TYPE_ALIAS = 'type_alias',
    FUNCTION = 'function',
    FUNCTION_CALL = 'function_call',
    FUNCTION_PARAMETERS = 'function_parameters',
}

export const objQueries = [
    QueryType.CLASS,
    QueryType.INTERFACE,
    QueryType.ENUM,
] as const;

export type ParserQuery = {
    type: QueryType;
    query: string;
};

export const queryToNodeTypeMap: Map<QueryType, NodeType> = new Map([
    [QueryType.IMPORT, NodeType.NODE_TYPE_IMPORT],
    [QueryType.CLASS, NodeType.NODE_TYPE_CLASS],
    [QueryType.INTERFACE, NodeType.NODE_TYPE_INTERFACE],
    [QueryType.ENUM, NodeType.NODE_TYPE_ENUM],
    [QueryType.TYPE_ALIAS, NodeType.NODE_TYPE_TYPE_ALIAS],
    [QueryType.FUNCTION, NodeType.NODE_TYPE_FUNCTION],
    [QueryType.FUNCTION_CALL, NodeType.NODE_TYPE_FUNCTION_CALL],
    [QueryType.FUNCTION_PARAMETERS, NodeType.UNRECOGNIZED], // No direct mapping
]);
