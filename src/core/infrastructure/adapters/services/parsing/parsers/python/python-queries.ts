import { ParserQuery, QueryType } from '../query.js';

const importQuery: ParserQuery = {
    type: QueryType.IMPORT,
    query: `
(import_statement
	(
        [
        (dotted_name) @origin
        (aliased_import
            name: (dotted_name) @origin
            alias: (identifier) @alias
        )
        ]+
        ","?
    )+
) @import

(import_from_statement
	module_name: [
    	(dotted_name)
        (relative_import)
    ] @origin
	(
        [
        (dotted_name) @symbol
        (aliased_import
            name: (dotted_name) @symbol
            alias: (identifier) @alias
        )
        (wildcard_import) @symbol
        ]+
        ","?
    )+
) @import
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS,
    query: `
(class_definition
	name: (identifier) @objName
    superclasses: (argument_list
    	(
    		(identifier) @objExtends
        	","?
        )*
    )?
    body: (block
    	(
        	[
        	(function_definition
            	name: (identifier) @objMethod
                parameters: (_) @objMethodParams
                return_type: (_)? @objMethodReturnType
            )
            (expression_statement
            	(assignment
                	left: (identifier) @objProperty
                    type: (_)? @objPropertyType
                )
            )
        	]
            _*
        )*
    )
) @obj
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION,
    query: `
(function_definition
    name: (identifier) @funcName
    parameters: (_) @funcParams
    return_type: (_)? @funcReturnType
    body: (block) @funcBody
) @func

(assignment
    left: (identifier) @funcName
    right: (lambda
        parameters: (_) @funcParams
        body: (_) @funcBody
    )
) @func
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL,
    query: `
(attribute
	attribute: (identifier)
) @call

(call
	function: (identifier)
) @call
`,
};

const functionParametersQuery: ParserQuery = {
    type: QueryType.FUNCTION_PARAMETERS,
    query: `
(parameters
    (
        [
        	(parameter
            	.
            	(identifier) @funcParamName
	            type: (_)? @funcParamType
    	    )
        	(identifier) @funcParamName
        ]
        _*
    )*
)
`,
};

export const pythonQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT, importQuery],

    [QueryType.CLASS, classQuery],

    [QueryType.FUNCTION, functionQuery],
    [QueryType.FUNCTION_CALL, functionCallQuery],
    [QueryType.FUNCTION_PARAMETERS, functionParametersQuery],
] as const);
