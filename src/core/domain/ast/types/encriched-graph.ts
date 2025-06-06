import { SyntaxNode } from 'tree-sitter';

export enum NodeType {
    CLASS = 'CLASS',
    METHOD = 'METHOD',
    FUNCTION = 'FUNCTION',
    INTERFACE = 'INTERFACE',
}

export type EnrichGraphNode = {
    id: string;
    type: NodeType;
    file: string;
    filePath: string;
};

export enum RelationshipType {
    CALLS = 'CALLS',
    CALLS_IMPLEMENTATION = 'CALLS_IMPLEMENTATION',
    HAS_METHOD = 'HAS_METHOD',
    IMPORTS = 'IMPORTS',
    IMPLEMENTS = 'IMPLEMENTS',
    IMPLEMENTED_BY = 'IMPLEMENTED_BY',
    EXTENDS = 'EXTENDS',
}

export type ImpactedNode = {
    id: string;
    type: string;
    severity: string;
    level: number;
    filePath: string;
    calledBy?: string[];
    importedBy?: string[];
};

export type EnrichGraphEdge = {
    from: string;
    to: string;
    type: RelationshipType;
    fromPath: string;
    toPath: string;
};

export type EnrichGraph = {
    nodes: EnrichGraphNode[];
    relationships: EnrichGraphEdge[];
};

export type ScopeAnalysis = {
    variables: string[];
    functions: string[];
    dependencies: string[];
};

export type ComplexityAnalysis = {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    details: {
        conditionals: number;
        loops: number;
        switches: number;
        catches: number;
        logicalOperators: number;
        recursion: boolean;
    };
};

export type ImpactResult = {
    function: string;
    impact: {
        summary: any;
        groupedByLevel: Record<string, ImpactedNode[]>;
    };
};

export type FunctionsAffect = {
    functionName: string;
    filePath: string;
    functionBody: string;
};

export type FunctionsAffectResult = {
    oldFunction: string;
    newFunction: string;
    functionsAffect: FunctionsAffect[];
};

export type FunctionSimilarity = {
    functionName: string;
    similarFunctions: [];
};

export type ChangeResult = {
    added: FunctionResult[];
    modified: FunctionResult[];
    deleted: FunctionResult[];
};

export type FunctionResult = {
    name: string;
    fullName: string;
    functionHash: string;
    signatureHash: string;
    node: SyntaxNode;
    fullText: string;
    lines: number;
};
