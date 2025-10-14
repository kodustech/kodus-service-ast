import { type ParserQuery, QueryType } from '../query.js';

const importQuery: ParserQuery = {
    type: QueryType.IMPORT,
    query: `
(use_declaration
	argument: (scoped_identifier
    	path: (_) @origin
        name: (identifier) @symbol
    )
) @import

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
) @import

(use_declaration
	argument: (use_wildcard
    	[
    		(identifier)
            (scoped_identifier)
        ] @origin
    )
) @import
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS,
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
) @obj

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
) @obj
`,
};

const interfaceQuery: ParserQuery = {
    type: QueryType.INTERFACE,
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
) @obj
`,
};

const enumQuery: ParserQuery = {
    type: QueryType.ENUM,
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
) @obj
`,
};

const typeAliasQuery: ParserQuery = {
    type: QueryType.TYPE_ALIAS,
    query: `
(type_item
	name: (type_identifier) @typeName
    type: (_) @typeValue
) @typeAlias
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION,
    query: `
(function_item
	name: (identifier) @funcName
    parameters: (parameters)? @funcParams
    return_type: (_)? @funcReturnType
    body: (_) @funcBody
) @func
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL,
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
    type: QueryType.FUNCTION_PARAMETERS,
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
    [QueryType.IMPORT, importQuery],

    [QueryType.CLASS, classQuery],
    [QueryType.INTERFACE, interfaceQuery],
    [QueryType.ENUM, enumQuery],

    [QueryType.TYPE_ALIAS, typeAliasQuery],

    [QueryType.FUNCTION, functionQuery],
    [QueryType.FUNCTION_CALL, functionCallQuery],
    [QueryType.FUNCTION_PARAMETERS, functionParametersQuery],
] as const);
