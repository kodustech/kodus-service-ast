export enum QueryType {
    IMPORT_QUERY,
    IMPORT_AUXILIARY_QUERY,

    CLASS_QUERY,
    INTERFACE_QUERY,
    ENUM_QUERY,

    FUNCTION_QUERY,
    FUNCTION_CALL_QUERY,
}

export type ParserQuery = {
    type: QueryType;
    query: string;
};
