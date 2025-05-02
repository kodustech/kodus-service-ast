/* eslint-disable no-useless-escape */
import { ParserQuery, QueryType } from '../query';

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
    (require_expression)
    (require_once_expression)
    (include_expression)
    (include_once_expression)
    ] @auxiliary
)
`,
    auxiliaryQuery: `
;; dirname(__FILE__) . '/foo.php';
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
    (#match? @farg "(__FILE__)|(__DIR__)")
)

;; __DIR__ . '/foo.php';
(binary_expression
	left: (name) @dir
    operator: "."
    right: (string (string_content) @origin)
    (#eq? @dir "__DIR__")
)

;; 'foo.php';
(string (string_content) @origin)
`,
};

const classQuery: ParserQuery = {
    type: QueryType.CLASS_QUERY,
    query: `
(class_declaration
    name: (name) @className
    (base_clause
        (name) @classExtends
    )?
    (class_interface_clause
        (
            (name) @classImplements
            ","?
        )+
    )?
    body: (declaration_list
    	(
        [
		(method_declaration
			name: (name) @classMethod
			parameters: (formal_parameters
            	(
                [
					(property_promotion_parameter
                    	type: (_)? @classMethodParamType
                		name: (_) @classMethodParamName
                	)
                    (simple_parameter
                    	type: (_)? @classMethodParamType
                		name: (_) @classMethodParamName
                	)
					(variadic_parameter
                    	type: (_)? @classMethodParamType
                		name: (_) @classMethodParamName
                	)
                ]
                ","?
                )*
			)?
            return_type: (_)? @classMethodReturnType
    	)
        (property_declaration
        	type: (_)? @classPropertyType
        	(property_element
            	(variable_name) @classProperty
            )
        )
        (const_declaration
        	type: (_)? @classPropertyType
        	(const_element
            	(name) @classProperty
            )
        )
        ]
        _*
        )*
    )
) @classDecl
`,
};

const interfaceQuery: ParserQuery = {
    type: QueryType.INTERFACE_QUERY,
    query: `
(interface_declaration) @interfaceDecl
(class_declaration) @classDecl
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION_QUERY,
    query: `
(function_definition) @function
(expression_statement
	(assignment_expression
    	right: (arrow_function)
    )
) @arrow
(method_declaration) @method
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL_QUERY,
    query: `
(function_call_expression) @call

(member_call_expression) @call
`,
};

const typeQuery: ParserQuery = {
    type: QueryType.TYPE_QUERY,
    query: `
(class_declaration
    name: (name) @className
    (base_clause)? @classExtends
    (class_interface_clause)? @classImplements
    body: (declaration_list) @classBody
) @classDecl

(interface_declaration
    name: (name) @interfaceName
    (base_clause)? @interfaceExtends
    body: (declaration_list) @interfaceBody
) @interfaceDecl

(enum_declaration
    name: (name) @enumName
    (class_interface_clause)? @enumImplements
    body: (enum_declaration_list) @enumBody
) @enumDecl
`,
    captureNames: {
        class: [
            'classDecl',
            'className',
            'classExtends',
            'classImplements',
            'classBody',
        ],
        interface: [
            'interfaceDecl',
            'interfaceName',
            'interfaceExtends',
            'interfaceBody',
        ],
        enum: [
            'enumDecl',
            'enumName',
            'enumBody',
            'enumImplements',
            'enumPrimitive',
        ],
        type: [],
    },
};

export const phpQueries = new Map<QueryType, ParserQuery>([
    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],
    [QueryType.TYPE_QUERY, typeQuery],

    [QueryType.IMPORT_QUERY, importQuery],
    [QueryType.CLASS_QUERY, classQuery],
    [QueryType.INTERFACE_QUERY, interfaceQuery],
] as const);
