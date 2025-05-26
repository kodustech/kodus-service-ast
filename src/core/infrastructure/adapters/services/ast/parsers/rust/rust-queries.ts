import { QueryType, ParserQuery } from '../query';

const importQuery: ParserQuery = {
    type: QueryType.IMPORT_QUERY,
    query: `
(use_declaration
	argument: (scoped_identifier
    	path: (_) @origin
        name: (identifier) @symbol
    )
)

(use_declaration
	argument: (scoped_use_list
    	path: (_) @origin
        list: (use_list
        	(
            	(identifier) @symbol
                _*
            )*
        )
    )
)

(use_declaration
	argument: (use_wildcard
    	[
    		(identifier)
            (scoped_identifier)
        ] @origin
    )
)
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS_QUERY,
    query: `
(struct_item
	name: (type_identifier) @objName
    body: (field_declaration_list
    	(
        	(field_declaration
            	name: (field_identifier) @objProperty
                type: (_)? @objPropertyType
            )
            _*
        )*
    )
)

(impl_item
	trait: (_)? @objImplements
	type: (_) @objName
    body: (declaration_list
    	(
            (function_item
                name: (identifier) @objMethod
                parameters: (parameters)? @objMethodParams
                return_type: (_)? @objMethodReturnType
            )
            _*
        )*
    )
)
`,
};

const interfaceQuery: ParserQuery = {
    type: QueryType.INTERFACE_QUERY,
    query: `
(trait_item
	name: (_) @objName
    bounds: (trait_bounds
    	(
        	(type_identifier) @objExtends
            _*
        )*
    )?
    body: (declaration_list
    	(
        	[
            	(associated_type
                	name: (_) @objProperty
                )
            	(function_signature_item
                    name: (identifier) @objMethod
                    parameters: (parameters)? @objMethodParams
                    return_type: (_)? @objMethodReturnType
                )
            ]
            _*
        )*
    )
)
`,
};

const enumQuery: ParserQuery = {
    type: QueryType.ENUM_QUERY,
    query: `
(enum_item
	name: (type_identifier) @objName
    body: (enum_variant_list
    	(
        	(enum_variant
            	name: (identifier) @objProperty
                body: (_)? @objPropertyType
            )
            _*
        )*
    )
)
`,
};

const typeAliasQuery: ParserQuery = {
    type: QueryType.TYPE_ALIAS_QUERY,
    query: `
(type_item
	name: (type_identifier) @typeName
    type: (_) @typeValue
)
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION_QUERY,
    query: `
(function_item
	name: (identifier) @funcName
    parameters: (parameters)? @funcParams
    return_type: (_)? @funcReturnType
    body: (_) @funcBody
)
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL_QUERY,
    query: `
(call_expression
	function: [
    	(field_expression)
        (scoped_identifier)
    ] @call
)

(call_expression
	function: (identifier)
) @call

(macro_invocation
	macro: (scoped_identifier) @call
)

(macro_invocation
	macro: (identifier)
) @call
`,
};

const functionParametersQuery: ParserQuery = {
    type: QueryType.FUNCTION_PARAMETERS_QUERY,
    query: `
(parameters
	(
    	[
        	(self_parameter
            	(self) @funcParamName
            )
			(parameter
        		pattern: (identifier) @funcParamName
            	type: (_)? @funcParamType
        	)
        ]
    	_*
    )*
)
`,
};

export const rustQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT_QUERY, importQuery],

    [QueryType.CLASS_QUERY, classQuery],
    [QueryType.INTERFACE_QUERY, interfaceQuery],
    [QueryType.ENUM_QUERY, enumQuery],

    [QueryType.TYPE_ALIAS_QUERY, typeAliasQuery],

    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],
    [QueryType.FUNCTION_PARAMETERS_QUERY, functionParametersQuery],
] as const);
