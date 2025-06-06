import { QueryType } from '@/core/infrastructure/adapters/services/ast/parsers/query';
import { Call, Scope } from './parser';

/**
 * Analysis of a file with its definitions and calls
 */
export type FileAnalysis = {
    defines: string[];
    calls: Call[];
    imports: string[];
    className: string[];
    usedBy?: {
        files: string[]; // Files that import this file
        functions: string[]; // Functions that use this file
        types: string[]; // Types defined in this file
    };
    dependencies?: {
        direct: string[]; // May include functions and imported files
        transitive: string[]; // To be calculated later (simple example)
    };
};

/**
 * Complete details of a defined function
 */
export type FunctionAnalysis = {
    nodeId: number;
    file: string;
    name: string;
    params: string[];
    lines: number;
    returnType: string;
    calls: Call[];
    className?: string;
    startLine: number;
    endLine: number;
    functionHash: string;
    signatureHash: string;
    bodyNode?: any;
    fullText: string;
};

/**
 * Details of a type (interface, type alias, or enum)
 */
export type TypeAnalysis = {
    nodeId: number;
    file: string;
    type: QueryType;
    name: string;
    fields: Record<string, string>;
    implements: string[];
    implementedBy: string[];
    extends: string[];
    extendedBy: string[];
    scope: Scope[];
};

/**
 * Complete code graph
 */
export type CodeGraph = {
    files: Map<string, FileAnalysis>;
    functions: Map<string, FunctionAnalysis>;
    types: Map<string, TypeAnalysis>;
};
