import { ParserQuery, QueryType } from '../query';

const mainQuery: ParserQuery = {
    type: QueryType.CLASS_QUERY,
    query: `
;; imports
(call
    method: (identifier) @import.type
    arguments: (argument_list (string (string_content)))
    (#match? @import.type "require|require_relative|load|autoload")
) @import

;; class
(class
    name: (constant)
) @definition.class

;; module
(module
    name: (constant)
) @definition.module

;; function
(
    [
        (method
            name: (identifier)
        )
        (singleton_method
            name: (identifier)
        )
    ] @definition.function
)

;; self.instance.method()
(call
    receiver: (call
        receiver: (self)
        method: (identifier) @self
    )
    method: (identifier) @instance
    arguments: (argument_list)
) @buildCall
`,
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION_QUERY,
    query: `
(
  method
    name: (identifier) @funcName
    parameters: (method_parameters) @params*
)

(
  singleton_method
    name: (identifier) @funcName
    parameters: (method_parameters) @params*
)

(
  assignment
    left: (identifier) @funcName
    right: (block
              parameters: (block_parameters) @params*)
)

(
  assignment
    left: (identifier) @funcName
    right: (do_block
              parameters: (block_parameters) @params*)
)
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL_QUERY,
    query: `
(
  call
    method: (identifier) @callName
)
`,
};

const typeQuery: ParserQuery = {
    type: QueryType.CLASS_QUERY,
    query: `
;; class
(class
    name: (constant) @className
    superclass: (constant)? @classHeritage
) @classDecl

;; module
(module
    name: (constant) @moduleName
) @moduleDecl
`,
};

export const rubyQueries = new Map<QueryType, ParserQuery>([
    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],
] as const);
