import { ParserQuery, QueryType } from '../query';

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
    type: QueryType.IMPORT_QUERY,
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
)
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS_QUERY,
    query: `
(class
    name: (constant) @objName
    superclass: (superclass (constant) @objExtends)?
    ${classBodyQuery()}
)

(module
    name: (constant) @objName
    ${classBodyQuery()}
)
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION_QUERY,
    query: `
(method
    name: (identifier) @funcName
    parameters: (_)? @funcParams
    body: (_) @funcBody
)

(singleton_method
    name: (identifier) @funcName
    parameters: (_)? @funcParams
    body: (_) @funcBody
)

(assignment
    left: (identifier) @funcName
    right: (lambda
    	parameters: (_)? @funcParams
        body: (_) @funcBody
    )
)
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL_QUERY,
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
    type: QueryType.FUNCTION_PARAMETERS_QUERY,
    query: `
(_
    (
        (identifier) @funcParamName
        _*
    )*
)
`,
};

const scopeQuery: ParserQuery = {
    type: QueryType.SCOPE_QUERY,
    query: `
(class
    name: (constant) @scope
    (#set! scope "class")
)

(module
    name: (constant) @scope
    (#set! scope "class")
)

(method
    name: (identifier) @scope
    (#set! scope "method")
)

(singleton_method
    name: (identifier) @scope
    (#set! scope "method")
)

(assignment
    left: (identifier) @scope
    right: (lambda)
    (#set! scope "function")
)
`,
};

export const rubyQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT_QUERY, importQuery],

    [QueryType.CLASS_QUERY, classQuery],

    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],
    [QueryType.FUNCTION_PARAMETERS_QUERY, functionParametersQuery],

    [QueryType.SCOPE_QUERY, scopeQuery],
] as const);
