import { type ParserQuery, QueryType } from '../query.js';

const importQuery: ParserQuery = {
    type: QueryType.IMPORT,
    query: `
(import_spec
    path: (interpreted_string_literal) @origin
)
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS,
    query: `
`,
};

export const goQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT, importQuery],

    [QueryType.CLASS, classQuery],
] as const);
