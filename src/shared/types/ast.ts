export interface Point {
    row: number;
    column: number;
}

export interface Range {
    startIndex: number;
    endIndex: number;
    startPosition: Point;
    endPosition: Point;
}

export enum NodeType {
    NODE_TYPE_UNSPECIFIED = 'NODE_TYPE_UNSPECIFIED',
    NODE_TYPE_IMPORT = 'NODE_TYPE_IMPORT',
    NODE_TYPE_CLASS = 'NODE_TYPE_CLASS',
    NODE_TYPE_INTERFACE = 'NODE_TYPE_INTERFACE',
    NODE_TYPE_ENUM = 'NODE_TYPE_ENUM',
    NODE_TYPE_FUNCTION = 'NODE_TYPE_FUNCTION',
    NODE_TYPE_FUNCTION_CALL = 'NODE_TYPE_FUNCTION_CALL',
    NODE_TYPE_TYPE_ALIAS = 'NODE_TYPE_TYPE_ALIAS',
    UNRECOGNIZED = 'UNRECOGNIZED',
}

export enum RelationshipType {
    RELATIONSHIP_TYPE_UNSPECIFIED = 'RELATIONSHIP_TYPE_UNSPECIFIED',
    RELATIONSHIP_TYPE_IMPORTS = 'RELATIONSHIP_TYPE_IMPORTS',
    RELATIONSHIP_TYPE_HAS_METHOD = 'RELATIONSHIP_TYPE_HAS_METHOD',
    RELATIONSHIP_TYPE_IMPLEMENTS = 'RELATIONSHIP_TYPE_IMPLEMENTS',
    RELATIONSHIP_TYPE_IMPLEMENTED_BY = 'RELATIONSHIP_TYPE_IMPLEMENTED_BY',
    RELATIONSHIP_TYPE_EXTENDS = 'RELATIONSHIP_TYPE_EXTENDS',
    RELATIONSHIP_TYPE_EXTENDED_BY = 'RELATIONSHIP_TYPE_EXTENDED_BY',
    RELATIONSHIP_TYPE_CALLS = 'RELATIONSHIP_TYPE_CALLS',
    RELATIONSHIP_TYPE_CALLS_IMPLEMENTATION = 'RELATIONSHIP_TYPE_CALLS_IMPLEMENTATION',
}

export interface AnalysisNode {
    id: string;
    name: string;
    type: NodeType;
    text: string;
    position: Range | null;
    children: AnalysisNode[];
}

export interface Scope {
    name: string;
    type: NodeType;
}

export interface Call {
    nodeId: string;
    function: string;
    file: string;
    caller: string;
}

export interface FileAnalysis {
    defines: string[];
    calls: Call[];
    imports: string[];
    className: string[];
    nodes: Map<string, AnalysisNode>;
}

export interface FunctionAnalysis {
    nodeId: string;
    position?: Range | null;
    file: string;
    name: string;
    params: string[];
    lines: number;
    returnType: string;
    calls: Call[];
    className: string;
    startLine: number;
    endLine: number;
    functionHash: string;
    signatureHash: string;
    fullText: string;
}

export interface TypeAnalysis {
    nodeId: string;
    position?: Range | null;
    name: string;
    extends?: string[];
    implements?: string[];
    fields?: Record<string, string> | Map<string, string>;
    extendedBy?: string[];
    implementedBy?: string[];
    scope: Scope[];
    file: string;
    type: NodeType;
}

export interface CodeGraph {
    files: Map<string, FileAnalysis>;
    functions: Map<string, FunctionAnalysis>;
    types: Map<string, TypeAnalysis>;
}

export interface EnrichedGraphNode {
    id: string;
    name: string;
    file: string;
    filePath: string;
    position?: Range | null;
    type: NodeType;
    owner?: string;
}

export interface EnrichedGraphEdge {
    from: string;
    to: string;
    type: RelationshipType;
    fromPath: string;
    toPath: string;
}

export interface EnrichedGraph {
    nodes: EnrichedGraphNode[];
    relationships: EnrichedGraphEdge[];
}

export interface SerializedFileAnalysis {
    defines: string[];
    calls: Call[];
    imports: string[];
    className: string[];
    nodes: Record<string, AnalysisNode>;
}

export interface SerializedCodeGraph {
    files: Record<string, SerializedFileAnalysis>;
    functions: Record<string, FunctionAnalysis>;
    types: Record<string, TypeAnalysis>;
}

export interface SerializedGetGraphsResponseData {
    graph: SerializedCodeGraph;
    enrichedGraph: EnrichedGraph;
}

export interface GetGraphsResponseData {
    graph: CodeGraph;
    enrichedGraph: EnrichedGraph;
}

export interface InitializeContentFromDiffRequest {
    files: {
        id: string;
        content: string;
        filePath: string;
        diff: string;
    }[];
}

export interface InitializeContentFromDiffResponse {
    taskId: string;
}

export enum FileContentFlag {
    DIFF = 'diff',
    FULL = 'full',
    SIMPLE = 'simple',
}

export interface GetContentFromDiffResponse {
    files: {
        id: string;
        content: string;
        flag: FileContentFlag;
    }[];
}

export interface StreamedResponse {
    data: Uint8Array;
}

export interface ValidateCodeItem {
    id: string;
    encodedData: string;
    language?: string;
    filePath: string;
}

export interface ValidateCodeRequest {
    files: ValidateCodeItem[];
}

export enum ValidationStatus {
    VALID = 'VALID',
    INVALID_SYNTAX = 'INVALID_SYNTAX',
    UNSUPPORTED_LANGUAGE = 'UNSUPPORTED_LANGUAGE',
    ERROR = 'ERROR',
}

export interface ValidateCodeResult {
    id: string;
    isValid: boolean;
    status: ValidationStatus;
    error?: string;
    filePath?: string;
}

export interface ValidateCodeResponse {
    results: ValidateCodeResult[];
}
