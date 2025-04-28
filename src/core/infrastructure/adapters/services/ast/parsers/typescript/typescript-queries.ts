import { QueryType, ParserQuery } from '../query';

const mainQuery: ParserQuery = {
    type: QueryType.MAIN_QUERY,
    query: `
;; Captura imports
(import_statement) @import

;; Captura declarações de classe, interface, enum, type, function, method
(class_declaration
  name: (type_identifier) @definition.class.name
) @definition.class

(interface_declaration
  name: (type_identifier) @definition.interface.name
) @definition.interface

(enum_declaration
  name: (identifier) @definition.enum.name
) @definition.enum

(type_alias_declaration
  name: (type_identifier) @definition.type.name
) @definition.type

(function_declaration
  name: (identifier) @definition.function.name
) @definition.function

(method_definition
  name: (property_identifier) @definition.method.name
) @definition.method

(function_signature
  name: (identifier) @definition.function.name
) @definition.function

(method_signature
  name: (property_identifier) @definition.method.name
) @definition.method

(abstract_method_signature
  name: (property_identifier) @definition.method.name
) @definition.method

;; Captura call_expressions do tipo "this.instance.method(...)"
(
  call_expression
    function: (member_expression
      object: (member_expression
        object: (this) @this
        property: (property_identifier) @instance
      )
      property: (property_identifier) @method
    )
    arguments: (_)
) @buildCall
`,
    captureNames: {
        import: ['import'],
        definition: [
            'definition.class',
            'definition.interface',
            'definition.enum',
            'definition.type',
            'definition.function',
            'definition.method',
        ],
        call: ['buildCall'],
    },
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION_QUERY,
    query: `
(
  function_declaration
    name: (identifier) @funcName
    parameters: (formal_parameters) @params
    body: (statement_block) @body
)
(
  method_definition
    name: (property_identifier) @funcName
    parameters: (formal_parameters) @params
    body: (statement_block) @body
)
(
  variable_declarator
    name: (identifier) @funcName
    value: (arrow_function
              parameters: (formal_parameters) @params
              body: (_) @body)
)
`,
    captureNames: undefined,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL_QUERY,
    query: `
(
call_expression
    function: (identifier) @callName
)
(
call_expression
    function: (member_expression
                property: (property_identifier) @callName)
)
`,
    captureNames: undefined,
};

const typeQuery: ParserQuery = {
    type: QueryType.TYPE_QUERY,
    query: `
;; Interface
(interface_declaration
name: (type_identifier) @ifaceName
body: (object_type)? @ifaceBody
(extends_clause)? @ifaceExt
) @ifaceDecl

;; Class
(class_declaration
name: (type_identifier) @className
(class_heritage)? @classHeritage
body: (class_body)? @classBody
) @classDecl

;; Type alias (type X = ...)
(type_alias_declaration
name: (type_identifier) @typeName
"="
(_) @aliasType
) @typeAliasDecl

;; Enum
(enum_declaration
name: (identifier) @enumName
body: (enum_body)? @enumBody
) @enumDecl
`,
    captureNames: {
        class: ['className', 'classHeritage', 'classBody'],
        interface: ['ifaceName', 'ifaceBody', 'ifaceExt'],
        enum: ['enumName', 'enumBody'],
        type: ['typeName', 'aliasType'],
    },
};

export const typeScriptQueries = new Map<QueryType, ParserQuery>([
    [QueryType.MAIN_QUERY, mainQuery],
    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],
    [QueryType.TYPE_QUERY, typeQuery],
] as const);
