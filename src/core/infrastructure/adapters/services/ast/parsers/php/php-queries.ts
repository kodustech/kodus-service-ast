/* eslint-disable no-useless-escape */
import { ParserQuery, QueryType } from '../query';

const parametersQuery = () => `
(formal_parameters
    (
        [
            (property_promotion_parameter
                type: (_)? @funcParamType
                name: (_) @funcParamName
            )
            (simple_parameter
                type: (_)? @funcParamType
                name: (_) @funcParamName
            )
            (variadic_parameter
                type: (_)? @funcParamType
                name: (_) @funcParamName
            )
        ]
        ","?
    )*
)?
`;

const declarationListQuery = () => `
    (declaration_list
    	(
        [
		(method_declaration
			name: (name) @objMethod
			parameters: ${parametersQuery()}
            return_type: (_)? @objMethodReturnType
    	)
        (property_declaration
        	type: (_)? @objPropertyType
        	(property_element
            	(variable_name) @objProperty
            )
        )
        (const_declaration
        	type: (_)? @objPropertyType
        	(const_element
            	(name) @objProperty
            )
        )
        ]
        _*
        )*
    )
`;

const importAuxiliaryQuery = () => `
[
    (binary_expression
        left: (function_call_expression
            function: (name) @fname
            arguments: (arguments
                (argument
                    (name) @farg
                )
            )
        )
        operator: "."
        right: (string (string_content) @origin)
        (#eq? @fname "dirname")
        (#match? @farg "__FILE__|__DIR__")
        (#set! leadingSlash "true") ;; it would be better to use a #strip! here but it is not supported https://github.com/tree-sitter/node-tree-sitter/issues/179
    )
    (binary_expression
        left: (name) @dir
        operator: "."
        right: (string (string_content) @origin)
        (#eq? @dir "__DIR__")
        (#set! leadingSlash "true") ;; it would be better to use a #strip! here but it is not supported https://github.com/tree-sitter/node-tree-sitter/issues/179
    )
    (string (string_content) @origin)
]
`;

const importQuery: ParserQuery = {
    type: QueryType.IMPORT_QUERY,
    query: `
;; use foo\bar;
;; use foo\bar as baz;
;; use foo\bar, biz\baz as buz, qux\qox;

(namespace_use_declaration
    (namespace_use_clause
        (qualified_name
            (namespace_name) @origin
            (name) @symbol
        )
        (name)? @alias
    )
)

;; use foo\bar\ {
;;  baz\buz,
;;  qux\qox as buz
;; }

(namespace_use_declaration
	(namespace_name) @origin
	(namespace_use_group
        (
    	    (namespace_use_clause
                (name) @symbol
                (name)? @alias
            )
            ","?
        )+
    )
)

;; require 'foo.php';
;; include __DIR__ . '/foo.php';

(expression_statement
	[
        (require_expression
            ${importAuxiliaryQuery()}
        )
        (require_once_expression
            ${importAuxiliaryQuery()}
        )
        (include_expression
            ${importAuxiliaryQuery()}
        )
        (include_once_expression
            ${importAuxiliaryQuery()}
        )
    ]
)
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS_QUERY,
    query: `
(class_declaration
    name: (name) @objName
    (base_clause
        (name) @objExtends
    )?
    (class_interface_clause
        (
            (name) @objImplements
            ","?
        )+
    )?
    body: ${declarationListQuery()}
)
`,
};

const interfaceQuery: ParserQuery = {
    type: QueryType.INTERFACE_QUERY,
    query: `
(interface_declaration
    name: (name) @objName
    (base_clause
        (name) @objExtends
    )?
    (class_interface_clause
        (
            (name) @objImplements
            ","?
        )+
    )?
    body: ${declarationListQuery()}
)
`,
};

const enumQuery: ParserQuery = {
    type: QueryType.ENUM_QUERY,
    query: `
(enum_declaration
    name: (name) @objName
    (primitive_type)? @enumType
    (base_clause
        (name) @objExtends
    )?
    (class_interface_clause
        (
            (name) @objImplements
            ","?
        )+
    )?
    body: (enum_declaration_list
    	(
        [
		(method_declaration
			name: (name) @objMethod
			parameters: ${parametersQuery()}
            return_type: (_)? @objMethodReturnType
    	)
        (enum_case
        	name: (name) @objProperty
            value: (_)? @objPropertyValue
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
	name: (name) @funcName
    parameters: ${parametersQuery()}
	return_type: (_)? @funcReturnType
    body: (_) @funcBody
)

(method_declaration
    name: (name) @funcName
    parameters: ${parametersQuery()}
    return_type: (_)? @funcReturnType
    body: (_) @funcBody
)

(expression_statement
	(assignment_expression
    	left: (variable_name) @funcName
        right: (arrow_function
       		parameters: ${parametersQuery()}
			return_type: (_)? @funcReturnType
            body: (_) @funcBody
        )
    )
)`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL_QUERY,
    query: `
(member_call_expression) @call
(scoped_call_expression) @call
(function_call_expression) @call
(nullsafe_member_call_expression) @call
`,
};

export const phpQueries = new Map<QueryType, ParserQuery>([
    [QueryType.IMPORT_QUERY, importQuery],

    [QueryType.CLASS_QUERY, classQuery],
    [QueryType.INTERFACE_QUERY, interfaceQuery],
    [QueryType.ENUM_QUERY, enumQuery],

    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],
] as const);
