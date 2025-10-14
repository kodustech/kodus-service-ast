import { type ParserQuery, QueryType } from '../query.js';

const classBodyQuery = () => `
(_
    (
        [
            (call) @objCall
            (instance_variable) @objProperty
            (class_variable) @objProperty
            (method
                name: (identifier) @objMethod
                parameters: (_)? @objMethodParams
            )
            (singleton_method
                name: (identifier) @objMethod
                parameters: (_)? @objMethodParams
            )
        ]
        _*
    )*
)
`;

const importQuery: ParserQuery = {
    type: QueryType.IMPORT,
    query: `
(call
    method: (identifier) @import.type
    arguments: (argument_list
    	(
            ","?
            (_)* @symbol
        )*
        (string (string_content) @origin)
        .
    )
    (#any-of? @import.type
        "require"
        "require_relative"
        "load"
        "autoload"
    )
) @import
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS,
    query: `
(class
    name: (constant) @objName
    superclass: (superclass (constant) @objExtends)?
    ${classBodyQuery()}
) @obj

(module
    name: (constant) @objName
    ${classBodyQuery()}
) @obj
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION,
    query: `
(method
    name: (identifier) @funcName
    parameters: (_)? @funcParams
    body: (_) @funcBody
) @func

(singleton_method
    name: (identifier) @funcName
    parameters: (_)? @funcParams
    body: (_) @funcBody
) @func

(assignment
    left: (identifier) @funcName
    right: (lambda
    	parameters: (_)? @funcParams
        body: (_) @funcBody
    )
) @func
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL,
    query: `
(call
    method: (identifier) @call.type
    (#not-any-of? @call.type
        "require"
        "require_relative"
        "load"
        "autoload"
        "include"
        "extends"
        "attr"
        "attr_reader"
        "attr_writer"
        "attr_accessor"
    )
    receiver: [
        (self)
        (identifier)
        (constant)
        (instance_variable)
        (class_variable)
    ]?
) @call
`,
};

const functionParametersQuery: ParserQuery = {
    type: QueryType.FUNCTION_PARAMETERS,
    query: `
(_
    (
        (identifier) @funcParamName
        _*
    )*
)
`,
};

export const rubyQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT, importQuery],

    [QueryType.CLASS, classQuery],

    [QueryType.FUNCTION, functionQuery],
    [QueryType.FUNCTION_CALL, functionCallQuery],
    [QueryType.FUNCTION_PARAMETERS, functionParametersQuery],
] as const);
