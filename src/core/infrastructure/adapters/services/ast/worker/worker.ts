import { SourceFileAnalyzer } from '../analyze-source-file';

interface input {
    rootDir: string;
    filePath: string;
    normalizedPath: string;
}

export function analyze(params: input) {
    try {
        return new SourceFileAnalyzer().analyzeSourceFile(
            params.rootDir,
            params.filePath,
            params.normalizedPath,
        );
    } catch (error) {
        console.error(error);
        throw error;
    }
}
