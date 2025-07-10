import { ParserQuery, QueryType } from '../query';

const classAuxiliaryQuery = () => `
	name: (type_identifier) @objName
    (class_heritage
    	(extends_clause
        	(
        		(identifier) @objExtends
                ","?
            )*
        )?
        (implements_clause
        	(
            	(type_identifier) @objImplements
                ","?
            )*
        )?
    )?
    body: (class_body
    	(
        	[
            	(public_field_definition
                	name: (property_identifier) @objProperty
                    type: (type_annotation
                    	(_) @objPropertyType
                    )?
                )
                (property_signature
                	name: (property_identifier) @objProperty
                    type: (type_annotation
                    	(_) @objPropertyType
                    )?
                )

                (method_definition
                	name: (property_identifier) @objMethod
                    parameters: (_)? @objMethodParams
                    return_type: (type_annotation (_) @objMethodReturnType)?
                )
				(method_signature
                	name: (property_identifier) @objMethod
                    parameters: (_)? @objMethodParams
                    return_type: (type_annotation (_) @objMethodReturnType)?
                )
                (abstract_method_signature
                	name: (property_identifier) @objMethod
                    parameters: (_)? @objMethodParams
                    return_type: (type_annotation (_) @objMethodReturnType)?
                )
            ]
            _*
        )*
    )
`;

const functionAxuliaryQuery = () => `
    parameters: (_)? @funcParams
    return_type: (type_annotation (_) @funcReturnType)?
    body: (_) @funcBody
`;

const importQuery: ParserQuery = {
    type: QueryType.IMPORT,
    query: `
(import_statement
	(import_clause
    	(
          [
              (namespace_import
                  (identifier) @symbol
              )
              (identifier) @symbol
              (named_imports
                  (
                      (import_specifier
                          name: (identifier) @symbol
                          alias: (identifier)? @alias
                      )
                      ","?
                  )*
              )
          ]
          ","?
        )*
    )?
    source: (string (string_fragment) @origin)
) @import

(variable_declarator
	name: (identifier) @symbol
    value: (call_expression
    	function: (identifier) @call.type
        arguments: (arguments
        	(string (string_fragment) @origin)
        )
    )
    (#eq? @call.type "require")
) @import
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS,
    query: `
(class_declaration
${classAuxiliaryQuery()}
) @obj

(abstract_class_declaration
${classAuxiliaryQuery()}
) @obj
`,
};

const interfaceQuery: ParserQuery = {
    type: QueryType.INTERFACE,
    query: `
(interface_declaration
	name: (type_identifier) @objName
    (extends_type_clause
      (
        (type_identifier) @objExtends
        ","?
      )*
    )?
    body: (interface_body
    	(
        	[
            	(property_signature
                	name: (property_identifier) @objProperty
                    type: (type_annotation
                    	(_) @objPropertyType
                    )?
                )
                (method_signature
                	name: (property_identifier) @objMethod
                    parameters: (_)? @objMethodParams
                    return_type: (type_annotation (_) @objMethodReturnType)?
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
    body: (enum_body
    	(
        	(_
            	name: (_) @objProperty
            )
           	","?
        )*
    )
) @obj
`,
};

const typeAliasQuery: ParserQuery = {
    type: QueryType.TYPE_ALIAS,
    query: `
(type_alias_declaration
	name: (type_identifier) @typeName
    value: [
    	(object_type
        	(
        		(property_signature
                	name: (property_identifier) @typeField
                    type: (type_annotation
                    	(_) @typeValue
                    )
                )
                ";"?
            )*
        )
        (union_type
        	(
              (_) @typeValue
              "|"?
            )*
        )
        (predefined_type) @typeValue
        (type_identifier) @typeValue
    ]
) @typeAlias
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION,
    query: `
(function_declaration
	name: (identifier) @funcName
    ${functionAxuliaryQuery()}
) @func

(method_definition
	name: (property_identifier) @funcName
    ${functionAxuliaryQuery()}
) @func

(variable_declarator
	name: (identifier) @funcName
    value: (arrow_function
        ${functionAxuliaryQuery()}
    )
) @func
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL,
    query: `
(call_expression
    function: (member_expression) @call
)

(call_expression
	function: (identifier)
) @call
`,
};

const functionParametersQuery: ParserQuery = {
    type: QueryType.FUNCTION_PARAMETERS,
    query: `
(formal_parameters
    (
        (_
            pattern: (identifier) @funcParamName
            type: (type_annotation
                (_) @funcParamType
            )?
        )
        _*
    )*
)
`,
};

export const typeScriptQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT, importQuery],

    [QueryType.CLASS, classQuery],
    [QueryType.INTERFACE, interfaceQuery],
    [QueryType.ENUM, enumQuery],

    [QueryType.TYPE_ALIAS, typeAliasQuery],

    [QueryType.FUNCTION, functionQuery],
    [QueryType.FUNCTION_CALL, functionCallQuery],
    [QueryType.FUNCTION_PARAMETERS, functionParametersQuery],
] as const);
