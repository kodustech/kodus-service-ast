import { ParserQuery, QueryType } from '../query';

const importQuery: ParserQuery = {
    type: QueryType.IMPORT,
    query: `
(import_declaration
	(scoped_identifier
    	scope: (_) @origin
    	name: (identifier) @symbol
    )
) @import

(import_declaration
	(identifier) @origin
) @import
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS,
    query: `
(class_declaration
	name: (identifier) @objName
    superclass: (superclass
    	(_) @objExtends
    )?
    interfaces: (super_interfaces
    	(type_list
        	(
            	(_) @objImplements
                _*
            )*
        )
    )?
    body: (class_body
    	(
        	[
            	(field_declaration
                	type: (_)? @objPropertyType
                    declarator: (variable_declarator
                    	name: (identifier) @objProperty
                    )
                )
                (constructor_declaration
                	name: (identifier) @objMethod
                    parameters: (formal_parameters)? @objMethodParams
                )
                (method_declaration
                	type: (_)? @objMethodReturnType
                	name: (identifier) @objMethod
                    parameters: (formal_parameters)? @objMethodParams
                )
            ]
            _*
        )*
    )
) @obj
`,
};

const interfaceQuery: ParserQuery = {
    type: QueryType.INTERFACE,
    query: `
(interface_declaration
	name: (identifier) @objName
    (extends_interfaces
    	(type_list
        	(
    			(_) @objExtends
            	_*
            )*
        )
    )?
    body: (interface_body
    	(
        	[
                (method_declaration
                	type: (_)? @objMethodReturnType
                	name: (identifier) @objMethod
                    parameters: (formal_parameters)? @objMethodParams
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
(enum_declaration
    name: (identifier) @objName
    interfaces: (super_interfaces
        (type_list
            (
                (_) @objExtends
                _*
            )*
        )
    )?
    body: (enum_body
        (
            (enum_constant
            name: (identifier) @objProperty
            )
            _*
        )*
        (enum_body_declarations
            (
            [
                (field_declaration
                    type: (_)? @objPropertyType
                    declarator: (variable_declarator
                        name: (identifier) @objProperty
                    )
                )
                (constructor_declaration
                    name: (identifier) @objMethod
                    parameters: (formal_parameters)? @objMethodParams
                )
                (method_declaration
                    type: (_)? @objMethodReturnType
                    name: (identifier) @objMethod
                    parameters: (formal_parameters)? @objMethodParams
                )
            ]
            _*
        )*
        )?
    )
) @obj
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION,
    query: `
(method_declaration
	type: (_)? @funcReturnType
    name: (identifier) @funcName
    parameters: (formal_parameters)? @funcParams
    body: (_) @funcBody
) @func

(constructor_declaration
    name: (identifier) @funcName
    parameters: (formal_parameters)? @funcParams
    body: (_) @funcBody
) @func

(variable_declarator
	name: (identifier) @funcName
    value: (lambda_expression
    	parameters: (_)? @funcParams
        body: (_)? @funcBody
    )
) @func
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL,
    query: `
(method_invocation
	name: (identifier)
) @call
`,
};

const functionParametersQuery: ParserQuery = {
    type: QueryType.FUNCTION_PARAMETERS,
    query: `
(formal_parameters
    (
        (formal_parameter
            type: (_)? @funcParamType
            name: (identifier) @funcParamName
        )
        _*
    )*
)

(inferred_parameters
	(
		(identifier) @funcParamName
        _*
    )*
)
`,
};

export const javaQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT, importQuery],

    [QueryType.CLASS, classQuery],
    [QueryType.INTERFACE, interfaceQuery],
    [QueryType.ENUM, enumQuery],

    [QueryType.FUNCTION, functionQuery],
    [QueryType.FUNCTION_CALL, functionCallQuery],
    [QueryType.FUNCTION_PARAMETERS, functionParametersQuery],
] as const);
