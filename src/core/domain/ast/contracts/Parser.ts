import {
    Call,
    FileAnalysis,
    FunctionAnalysis,
    TypeAnalysis,
} from './CodeGraph';

export type ParseContext = {
    fileDefines: Set<string>;
    fileImports: Set<string>;
    fileClassNames: Set<string>;
    fileCalls: Call[];
    importedMapping: Map<string, string>;
    instanceMapping: Map<string, string>;
    types: Map<string, TypeAnalysis>;
    functions: Map<string, FunctionAnalysis>;
};

export type ParserAnalysis = {
    fileAnalysis: FileAnalysis;
    functions: Map<string, FunctionAnalysis>;
    types: Map<string, TypeAnalysis>;
};
