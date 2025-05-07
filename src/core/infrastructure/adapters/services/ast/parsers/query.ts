export enum QueryType {
    IMPORT_QUERY = 'import',

    CLASS_QUERY = 'class',
    INTERFACE_QUERY = 'interface',
    ENUM_QUERY = 'enum',

    FUNCTION_QUERY = 'function',
    FUNCTION_CALL_QUERY = 'function_call',
}

export const objTypes = [
    QueryType.CLASS_QUERY,
    QueryType.INTERFACE_QUERY,
    QueryType.ENUM_QUERY,
] as const;

export type ParserQuery = {
    type: QueryType;
    query: string;
};
