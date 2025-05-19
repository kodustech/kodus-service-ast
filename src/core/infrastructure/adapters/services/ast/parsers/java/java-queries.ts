import { QueryType, ParserQuery } from '../query';

const importQuery: ParserQuery = {
    type: QueryType.IMPORT_QUERY,
    query: `
(import_declaration
	(scoped_identifier
    	scope: (_) @origin
    	name: (identifier) @symbol
    )
)

(import_declaration
	(identifier) @origin
)
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS_QUERY,
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
)
`,
};

const interfaceQuery: ParserQuery = {
    type: QueryType.INTERFACE_QUERY,
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
)
`,
};

const enumQuery: ParserQuery = {
    type: QueryType.ENUM_QUERY,
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
)
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION_QUERY,
    query: `
(method_declaration
	type: (_)? @funcReturnType
    name: (identifier) @funcName
    parameters: (formal_parameters)? @funcParams
    body: (_) @funcBody
)

(constructor_declaration
    name: (identifier) @funcName
    parameters: (formal_parameters)? @funcParams
    body: (_) @funcBody
)

(variable_declarator
	name: (identifier) @funcName
    value: (lambda_expression
    	parameters: (_)? @funcParams
        body: (_)? @funcBody
    )
)
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL_QUERY,
    query: `
(method_invocation
	name: (identifier)
) @call
`,
};

const functionParametersQuery: ParserQuery = {
    type: QueryType.FUNCTION_PARAMETERS_QUERY,
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

const scopeQuery: ParserQuery = {
    type: QueryType.SCOPE_QUERY,
    query: `
(class_declaration
    name: (identifier) @scope
    (#set! scope "class")
)

(interface_declaration
    name: (identifier) @scope
    (#set! scope "interface")
)

(enum_declaration
    name: (identifier) @scope
    (#set! scope "enum")
)

(constructor_declaration
    name: (identifier) @scope
    (#set! scope "function")
)

(method_declaration
    name: (identifier) @scope
    (#set! scope "method")
)

(variable_declarator
	name: (identifier) @scope
    value: (lambda_expression)
    (#set! scope "function")
)
`,
};

export const javaQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT_QUERY, importQuery],

    [QueryType.CLASS_QUERY, classQuery],
    [QueryType.INTERFACE_QUERY, interfaceQuery],
    [QueryType.ENUM_QUERY, enumQuery],

    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],
    [QueryType.FUNCTION_PARAMETERS_QUERY, functionParametersQuery],

    [QueryType.SCOPE_QUERY, scopeQuery],
] as const);
