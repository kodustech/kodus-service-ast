import { Language, Query } from 'tree-sitter';

export enum QueryType {
    MAIN_QUERY,
    FUNCTION_QUERY,
    FUNCTION_CALL_QUERY,
    TYPE_QUERY,

    PARENT_CHAIN_QUERY,
    IMPORT_QUERY,
    IMPORT_AUXILIARY_QUERY,
    CLASS_QUERY,
    INTERFACE_QUERY,
    ENUM_QUERY,
    DECLARATION_QUERY,
    BODY_QUERY,
}

export type MainQueryCaptureNames = {
    import: string[];
    definition: string[];
    call: string[];
};

export type TypeQueryCaptureNames = {
    class: string[];
    interface: string[];
    enum: string[];
    type: string[];
};

export type BaseParserQuery<T extends QueryType> = {
    type: T;
    query: string;
};

export type ParserQueryWithCaptures<
    T extends QueryType,
    C,
> = BaseParserQuery<T> & {
    captureNames?: C;
};

export type MainParserQuery = ParserQueryWithCaptures<
    QueryType.MAIN_QUERY,
    MainQueryCaptureNames
>;

export type TypeParserQuery = ParserQueryWithCaptures<
    QueryType.TYPE_QUERY,
    TypeQueryCaptureNames
>;

export type GenericParserQuery = ParserQueryWithCaptures<
    Exclude<QueryType, QueryType.MAIN_QUERY | QueryType.TYPE_QUERY>,
    undefined
>;

export type ParserQuery =
    | GenericParserQuery
    | MainParserQuery
    | TypeParserQuery;

export type CaptureNamesForType<T extends QueryType> =
    Extract<ParserQuery, { type: T }> extends { captureNames?: infer C }
        ? C
        : undefined;

export class EnhancedQuery<T extends QueryType> extends Query {
    constructor(
        language: Language,
        source: string | Buffer,
        public captureNames?: CaptureNamesForType<T>,
    ) {
        super(language, source);
    }
}
