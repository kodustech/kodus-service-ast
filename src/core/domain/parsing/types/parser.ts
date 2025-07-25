import {
    AnalysisNode,
    Call,
    FileAnalysis,
    FunctionAnalysis,
    Range,
    Scope,
    TypeAnalysis,
} from '@kodus/kodus-proto/ast/v2';
import { SyntaxNode } from 'tree-sitter';

export type ParseContext = {
    filePath: string;
    fileDefines: Set<string>;
    fileImports: Set<string>;
    fileClassNames: Set<string>;
    fileCalls: Call[];
    importedMapping: Map<string, string>;
    instanceMapping: Map<string, string>;
    types: Map<string, TypeAnalysis>;
    functions: Map<string, FunctionAnalysis>;
    analysisNodes: Map<string, AnalysisNode>;
    nodeIdMap: Map<number, string>;
    idMap: Map<string, number>;
};

export type ParserAnalysis = {
    fileAnalysis: FileAnalysis;
    functions: Map<string, FunctionAnalysis>;
    types: Map<string, TypeAnalysis>;
};

export type ImportedSymbol = {
    nodeId: string;
    symbol: string;
    alias: string | null;
};

export type Method = {
    nodeId: string;
    name: string;
    params: MethodParameter[];
    returnType: string | null;
    bodyNode: SyntaxNode | null;
    scope: Scope[];
    position: Range;
};

export type MethodParameter = {
    nodeId: string;
    name: string;
    type: string | null;
};

export type ObjectProperties = {
    properties: ObjectProperty[];
    type: string | null;
};

export type ObjectProperty = {
    nodeId: string;
    name: string;
    type: string | null;
    value: string | null;
};

export type CallChain = {
    nodeId: string;
    name: string;
    type: ChainType;
};

export enum ChainType {
    FUNCTION = 'function',
    MEMBER = 'member',
}
