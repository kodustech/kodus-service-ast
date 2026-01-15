import { type Diagnostic } from 'vscode-languageserver-protocol';
import { type RepositoryData } from './ast.js';
import { type TaskPriority } from './task.js';

export interface SuggestionDiagnosticRequest {
    repoData: RepositoryData;
    files: {
        filePath: string;
        encodedPatch: string;
    }[];
    priority?: TaskPriority | number;
}

export interface SuggestionDiagnosticResponse {
    status: 'clean' | 'error';
    filePath: string;
    diagnostics: Diagnostic[];
}
