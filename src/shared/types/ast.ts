import { type TaskPriority } from './task.js';

export enum ProtoPlatformType {
    PROTO_PLATFORM_TYPE_UNSPECIFIED = 'PROTO_PLATFORM_TYPE_UNSPECIFIED',
    PROTO_PLATFORM_TYPE_GITHUB = 'PROTO_PLATFORM_TYPE_GITHUB',
    PROTO_PLATFORM_TYPE_GITLAB = 'PROTO_PLATFORM_TYPE_GITLAB',
    PROTO_PLATFORM_TYPE_BITBUCKET = 'PROTO_PLATFORM_TYPE_BITBUCKET',
    PROTO_PLATFORM_TYPE_AZURE_DEVOPS = 'PROTO_PLATFORM_TYPE_AZURE_DEVOPS',
}

export interface RepositoryAuth {
    token?: string;
    username?: string;
    password?: string;
}

export interface RepositoryData {
    organizationId: string;
    repositoryId: string;
    repositoryName: string;
    branch: string;
    url: string;
    provider: ProtoPlatformType;
    auth?: RepositoryAuth | null;
    commitSha?: string | null;
    installationId?: string | number | null;
    workspaceId?: string | number | null;
    defaultBranch?: string | null;
}

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

export interface GraphWithDir<T> {
    graph: T;
    dir: string;
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

export type SerializedGraphWithDir = GraphWithDir<SerializedCodeGraph>;

export interface SerializedGetGraphsResponseData {
    baseGraph: SerializedGraphWithDir;
    headGraph: SerializedGraphWithDir;
    enrichHeadGraph: EnrichedGraph;
}

export interface GetGraphsRequest {
    headRepo: RepositoryData;
    baseRepo?: RepositoryData | null;
}

export interface GetGraphsResponseData {
    baseGraph: GraphWithDir<CodeGraph>;
    headGraph: GraphWithDir<CodeGraph>;
    enrichHeadGraph: EnrichedGraph;
}

export interface InitializeRepositoryRequest extends GetGraphsRequest {
    baseRepo: RepositoryData;
    filePaths?: string[];
    priority?: TaskPriority;
}

export interface InitializeRepositoryResponse {
    taskId: string;
}

export interface DeleteRepositoryRequest extends GetGraphsRequest {
    baseRepo: RepositoryData;
}

export type DeleteRepositoryResponse = Record<string, never>;

export interface GetContentFromDiffRequest extends GetGraphsRequest {
    diff: string;
    filePath: string;
}

export interface GetContentFromDiffResponse {
    data: Uint8Array;
}

export interface StreamedResponse {
    data: Uint8Array;
}

export interface InitializeImpactAnalysisRequest extends GetGraphsRequest {
    baseRepo: RepositoryData;
    codeChunk: string;
    fileName: string;
    priority?: TaskPriority;
}

export interface InitializeImpactAnalysisResponse {
    taskId: string;
}

export interface GetImpactAnalysisRequest extends GetGraphsRequest {
    baseRepo: RepositoryData;
}

export interface FunctionsAffect {
    functionName: string;
    filePath: string;
    functionBody: string;
}

export interface FunctionsAffectResult {
    oldFunction: string;
    newFunction: string;
    functionsAffect: FunctionsAffect[];
}

export interface FunctionSimilar {
    functionName: string;
    isSimilar: boolean;
    explanation: string;
}

export interface FunctionSimilarity {
    functionName: string;
    similarFunctions: FunctionSimilar[];
}

export interface GetImpactAnalysisResponse {
    functionsAffect: FunctionsAffectResult[];
    functionSimilarity: FunctionSimilarity[];
}
