import { QueryType, ParserQuery } from '../query';

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
                (method_definition
                	name: (property_identifier) @objMethod
                    parameters: (_)? @objMethodParams
                    return_type: (type_annotation (_) @objMethodReturnType)?
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
    type: QueryType.IMPORT_QUERY,
    query: `
(import_statement
	(import_clause
    	(
          [
              (namespace_import
                  (identifier) @alias
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
)

(variable_declarator
	name: (identifier) @symbol
    value: (call_expression
    	function: (identifier) @call.type
        arguments: (arguments
        	(string (string_fragment) @origin)
        )
    )
    (#eq? @call.type "require")
)
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS_QUERY,
    query: `
(class_declaration
${classAuxiliaryQuery()}
)

(abstract_class_declaration
${classAuxiliaryQuery()}
)
`,
};

const interfaceQuery: ParserQuery = {
    type: QueryType.INTERFACE_QUERY,
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
)
`,
};

const enumQuery: ParserQuery = {
    type: QueryType.ENUM_QUERY,
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
)
`,
};

const typeAliasQuery: ParserQuery = {
    type: QueryType.TYPE_ALIAS_QUERY,
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
)
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION_QUERY,
    query: `
(function_declaration
	name: (identifier) @funcName
    ${functionAxuliaryQuery()}
)

(method_definition
	name: (property_identifier) @funcName
    ${functionAxuliaryQuery()}
)

(variable_declarator
	name: (identifier) @funcName
    value: (arrow_function
        ${functionAxuliaryQuery()}
    )
)
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL_QUERY,
    query: `
(statement_block
  (_
    [
    	(call_expression)
        (member_expression)
    ] @call
  )
)

(statement_block
  (_
  	(await_expression
      [
          (call_expression)
          (member_expression)
      ] @call
    )
  )
)
`,
};

const functionParametersQuery: ParserQuery = {
    type: QueryType.FUNCTION_PARAMETERS_QUERY,
    query: `
(_
    (
        (_
            pattern: (identifier) @funcParamName
            type: (type_annotation
                (_) @funcParamType
            )?
        )
        _*
    )*
)?
`,
};

export const typeScriptQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT_QUERY, importQuery],

    [QueryType.CLASS_QUERY, classQuery],
    [QueryType.INTERFACE_QUERY, interfaceQuery],
    [QueryType.ENUM_QUERY, enumQuery],

    [QueryType.TYPE_ALIAS_QUERY, typeAliasQuery],

    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],
    [QueryType.FUNCTION_PARAMETERS_QUERY, functionParametersQuery],
] as const);
