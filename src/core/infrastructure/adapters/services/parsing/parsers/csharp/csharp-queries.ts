import { ParserQuery, QueryType } from '../query.js';

const importQuery: ParserQuery = {
    type: QueryType.IMPORT,
    query: `
(using_directive
    name: (identifier)? @alias
	(qualified_name
    	qualifier: (_) @origin
    	name: (identifier) @symbol
    )
    .
) @import

(using_directive
    name: (identifier)? @alias
	(identifier) @origin
    .
) @import
`,
};

const classAuxiliaryQuery = `
        name: (identifier) @objName
        (base_list
            (
                (_) @objExtends
                _*
            )*
        )?
        body: (declaration_list
            (
                [
                    (field_declaration
                        (variable_declaration
                            type: (_)? @objPropertyType
                            (variable_declarator) @objProperty
                        )
                    )
                    (property_declaration
                        type: (_)? @objPropertyType
                        name: (_) @objProperty
                    )
                    (constructor_declaration
                        name: (identifier) @objMethod
                        parameters: (parameter_list)? @objMethodParams
                    )
                    (method_declaration
                        returns: (_)? @objMethodReturnType
                        name: (identifier) @objMethod
                        parameters: (parameter_list)? @objMethodParams
                    )
                ]
                _*
            )*
        )
    `;

const classQuery: ParserQuery = {
    type: QueryType.CLASS,
    query: `
(class_declaration
    ${classAuxiliaryQuery}
) @obj

(record_declaration
    ${classAuxiliaryQuery}
) @obj

(struct_declaration
    ${classAuxiliaryQuery}
) @obj
`,
};

const interfaceQuery: ParserQuery = {
    type: QueryType.INTERFACE,
    query: `
(interface_declaration
    ${classAuxiliaryQuery}
) @obj
`,
};

const enumQuery: ParserQuery = {
    type: QueryType.ENUM,
    query: `
(enum_declaration
        name: (identifier) @objName
        (base_list
        	.
        	(_) @enumType
            .
        )?
        body: (enum_member_declaration_list
        	(
            	(enum_member_declaration
            		name: (identifier) @objProperty
                    value: (_)? @objPropertyValue
            	)
            	_*
            )*
        )
) @obj
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION,
    query: `
(method_declaration
	returns: (_)? @funcReturnType
    name: (identifier) @funcName
    parameters: (parameter_list)? @funcParams
    body: (_) @funcBody
) @func

(constructor_declaration
    name: (identifier) @funcName
    parameters: (parameter_list)? @funcParams
    body: (_) @funcBody
) @func

(variable_declaration
    (variable_declarator
    	name: (_) @funcName
        (anonymous_method_expression
        	parameters: (parameter_list)? @funcParams
            (block) @funcBody
        )
    )
) @func
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL,
    query: `
(invocation_expression
	function: (member_access_expression) @call
)

(invocation_expression
	function: (identifier)
) @call
    `,
};

const functionParametersQuery = {
    type: QueryType.FUNCTION_PARAMETERS,
    query: `
(parameter_list
    (
        (parameter
          type: (_)? @funcParamType
          name: (identifier) @funcParamName
        )
        ","?
    )*
)
`,
};

export const cSharpQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT, importQuery],

    [QueryType.CLASS, classQuery],
    [QueryType.INTERFACE, interfaceQuery],
    [QueryType.ENUM, enumQuery],

    [QueryType.FUNCTION, functionQuery],
    [QueryType.FUNCTION_CALL, functionCallQuery],
    [QueryType.FUNCTION_PARAMETERS, functionParametersQuery],
] as const);
