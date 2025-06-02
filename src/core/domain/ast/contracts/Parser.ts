import { QueryType } from '@/core/infrastructure/adapters/services/ast/parsers/query';
import { FileAnalysis, FunctionAnalysis, TypeAnalysis } from './CodeGraph';
import { Range, SyntaxNode } from 'tree-sitter';

export enum ScopeType {
    FILE = 'file',
    CLASS = 'class',
    INTERFACE = 'interface',
    ENUM = 'enum',
    FUNCTION = 'function',
    METHOD = 'method',
}

export type Scope = {
    type: ScopeType;
    name: string;
};

export const scopeTypeMap: Record<string, ScopeType> = Object.values(
    ScopeType,
).reduce(
    (map, value) => {
        map[value] = value;
        return map;
    },
    {} as Record<string, ScopeType>,
);

/**
 * Details of a function call
 */
export interface Call {
    nodeId: number;
    function: string;
    file: string;
    caller?: string;
}

export type AnalysisNode = {
    text: string;
    type: string;
    queryType: QueryType;
    id: number;
    children?: AnalysisNode[];
    position: Range;
};

export type ParseContext = {
    fileDefines: Set<string>;
    fileImports: Set<string>;
    fileClassNames: Set<string>;
    fileCalls: Call[];
    importedMapping: Map<string, string>;
    instanceMapping: Map<string, string>;
    types: Map<string, TypeAnalysis>;
    functions: Map<string, FunctionAnalysis>;
    analysisNodes: Map<number, AnalysisNode>;
};

export type ParserAnalysis = {
    fileAnalysis: FileAnalysis;
    functions: Map<string, FunctionAnalysis>;
    types: Map<string, TypeAnalysis>;
    analysisNodes: Map<number, AnalysisNode>;
};

export type ImportedSymbol = {
    nodeId: number;
    symbol: string;
    alias: string | null;
};

export type Method = {
    nodeId: number;
    name: string;
    params: MethodParameter[];
    returnType: string | null;
    bodyNode: SyntaxNode | null;
    scope: Scope[];
};

export type MethodParameter = {
    nodeId: number;
    name: string;
    type: string | null;
};

export type ObjectProperties = {
    properties: ObjectProperty[];
    type: string | null;
};

export type ObjectProperty = {
    nodeId: number;
    name: string;
    type: string | null;
    value: string | null;
};

export type CallChain = {
    nodeId: number;
    name: string;
    type: ChainType;
};

export enum ChainType {
    FUNCTION = 'function',
    MEMBER = 'member',
}
