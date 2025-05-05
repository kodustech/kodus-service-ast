import { ParserQuery, QueryType } from '../query';

const parametersQuery = () => `
(_
    (
        [
        (_
            (identifier) @funcParamName
            type: (_)? @funcParamType
        )
        (identifier) @funcParamName
        ]
        ","?
    )*
)
`;

const importQuery: ParserQuery = {
    type: QueryType.IMPORT_QUERY,
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
)

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
)
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS_QUERY,
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
                parameters: ${parametersQuery()}
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
)
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION_QUERY,
    query: `
(function_definition
    name: (identifier) @funcName
    parameters: ${parametersQuery()}
    return_type: (_)? @funcReturnType
    body: (block) @funcBody
)

(assignment
    left: (identifier) @funcName
    right: (lambda
        parameters: ${parametersQuery()}
        body: (_) @funcBody
    )
)
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL_QUERY,
    query: `
(call) @call
`,
};

export const pythonQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT_QUERY, importQuery],

    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],

    [QueryType.CLASS_QUERY, classQuery],
] as const);
