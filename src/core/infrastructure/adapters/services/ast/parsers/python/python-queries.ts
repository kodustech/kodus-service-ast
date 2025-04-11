import { ParserQuery, QueryType } from '../base-parser';

const mainQuery: ParserQuery = {
    type: QueryType.MAIN_QUERY,
    query: `
;; Imports
(import_statement) @import
(import_from_statement) @import

;; Class
(class_definition
  name: (identifier) @definition.class.name
) @definition.class

;; Function
(function_definition
  name: (identifier) @definition.function.name
) @definition.function

;; self.instance.method()
(
  call
  function: (attribute
    object: (attribute
      object: (identifier) @self
      (#match? @self "self")
      attribute: (identifier) @instance
    )
    attribute: (identifier) @method
  )
  arguments: (_)
) @buildCall
`,
    captureNames: {
        import: ['import'],
        definition: ['definition.class', 'definition.function'],
        call: ['buildCall'],
    },
};

const functionQuery: ParserQuery = {
    type: QueryType.FUNCTION_QUERY,
    query: `
;; Function definitions with name, params, and body
(
  function_definition
    name: (identifier) @funcName
    parameters: (parameters) @params
    body: (block) @body
)

;; Method definitions (functions inside classes)
(
  class_definition
    body: (block
      (function_definition
        name: (identifier) @funcName
        parameters: (parameters) @params
        body: (block) @body
      )
    )
)

;; Lambda function assignments (similar to arrow functions)
(
  assignment
    left: (identifier) @funcName
    right: (lambda
      parameters: (lambda_parameters) @params
      body: (_) @body
    )
)
`,
};

const functionCallQuery: ParserQuery = {
    type: QueryType.FUNCTION_CALL_QUERY,
    query: `
;; Simple function calls (e.g., func())
(
  call
    function: (identifier) @callName
)

;; Method calls (e.g., obj.method())
(
  call
    function: (attribute
                attribute: (identifier) @callName)
)
`,
};

const typeQuery: ParserQuery = {
    type: QueryType.TYPE_QUERY,
    query: `
;; Class
(
  class_definition
  name: (identifier) @className
  superclasses: (argument_list) @classHeritage?
  body: (block) @classBody
) @classDecl
`,
};

export const pythonQueries: Map<QueryType, ParserQuery> = new Map([
    [QueryType.MAIN_QUERY, mainQuery],
    [QueryType.FUNCTION_QUERY, functionQuery],
    [QueryType.FUNCTION_CALL_QUERY, functionCallQuery],
    [QueryType.TYPE_QUERY, typeQuery],
] as const);
