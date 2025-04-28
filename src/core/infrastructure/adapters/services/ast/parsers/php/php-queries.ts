import { ParserQuery, QueryType } from '../query';

const mainQuery: ParserQuery = {
    type: QueryType.MAIN_QUERY,
    query: `
(namespace_use_declaration) @import
(expression_statement
    [
        (require_expression)
        (include_expression)
        (require_once_expression)
        (include_once_expression)
    ]
) @import


(class_declaration) @definition.class
(interface_declaration) @definition.interface
(enum_declaration) @definition.enum
(function_definition) @definition.function
(expression_statement
	(assignment_expression
    	right: (arrow_function)
    )
) @definition.function
(method_declaration) @definition.method
(member_call_expression object: (member_access_expression)) @buildCall
`,
    captureNames: {
        import: ['import'],
        definition: [
            'definition.class',
            'definition.interface',
            'definition.enum',
            'definition.function',
            'definition.method',
        ],
        call: ['buildCall'],
    },
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
    captureNames: undefined,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL_QUERY,
    query: `
(function_call_expression) @call

(member_call_expression) @call
`,
    captureNames: undefined,
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
    [QueryType.MAIN_QUERY, mainQuery],
    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],
    [QueryType.TYPE_QUERY, typeQuery],
] as const);
