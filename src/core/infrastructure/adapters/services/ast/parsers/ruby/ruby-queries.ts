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
                parameters: (method_parameters
                    (
                        (identifier) @funcParamName
                        ","?
                    )*
                )?
            )
            (singleton_method
                name: (identifier) @objMethod
                parameters: (method_parameters
                    (
                        (identifier) @funcParamName
                        ","?
                    )*
                )?
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
    parameters: (method_parameters
    	(
    		(identifier) @funcParamName
    		","?
    	)*
    )?
    body: (_) @funcBody
)

(singleton_method
    name: (identifier) @funcName
    parameters: (method_parameters
    	(
    		(identifier) @funcParamName
    		","?
    	)*
    )?
    body: (_) @funcBody
)

(assignment
    left: (identifier) @funcName
    right: (lambda
    	parameters: (lambda_parameters
        	(
        		(identifier) @funcParamName
                ","?
            )*
        )?
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
) @call
`,
};

export const rubyQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT_QUERY, importQuery],
    [QueryType.CLASS_QUERY, classQuery],
    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],
] as const);
