import { QueryType, ParserQuery } from '../query';

const importQuery: ParserQuery = {
    type: QueryType.IMPORT_QUERY,
    query: `
(import_spec
    path: (interpreted_string_literal) @origin
)
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS_QUERY,
    query: `
`,
};

export const goQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT_QUERY, importQuery],

    [QueryType.CLASS_QUERY, classQuery],
] as const);
