import { FunctionAnalysis, NodeType } from '@kodus/kodus-proto/ast/v2';

export interface ChangeResult {
    added: FunctionResult[];
    modified: FunctionResult[];
    deleted: FunctionResult[];
}

export interface FunctionResult {
    name: string;
    fullName: string;
    functionHash: string;
    signatureHash: string;
    id: number;
    fullText: string;
    lines: number;
}

// Basic interfaces needed
export interface DiffHunk {
    oldStart: number; // Starting line in the old version
    oldCount: number; // Number of lines in the old version
    newStart: number; // Starting line in the new version
    newCount: number; // Number of lines in the new version
    content: string; // Hunk content with +/− markers
}

// Local interface to represent a function with its lines
export interface ExtendedFunctionInfo extends Omit<FunctionAnalysis, 'name'> {
    name: string;
    startLine: number;
    endLine: number;
    bodyNode?: any;
}

export interface ScopeAnalysis {
    variables: string[];
    functions: string[];
    dependencies: string[];
}

export interface ComplexityAnalysis {
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
}

/** Impacted node (with optional fields) */
export interface ImpactedNode {
    id: number;
    name: string;
    type: NodeType;
    severity: string;
    level: number;
    filePath: string;
    calledBy: string[];
    importedBy: string[];
}

export interface ImpactResult {
    function: string;
    impact: {
        summary: any;
        groupedByLevel: Record<string, ImpactedNode[]>;
    };
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

export interface FunctionSimilarity {
    functionName: string;
    similarFunctions: FunctionSimilar[];
}

export interface FunctionSimilar {
    functionName: string;
    isSimilar: boolean;
    explanation: string;
}
