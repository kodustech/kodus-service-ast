import { ParserAnalysis } from '@/core/domain/parsing/types/parser';
import { SourceFileAnalyzer } from '../analyze-source-file';
import * as path from 'path';

export type WorkerInput = {
    rootDir: string;
    batch: string[];
};

export type WorkerOutput = {
    files: {
        filePath: string;
        normalizedPath: string;
        analysis: ParserAnalysis;
    }[];
    errors: string[];
};

export async function analyzeBatch(params: WorkerInput): Promise<WorkerOutput> {
    const { rootDir, batch } = params;

    const results: WorkerOutput = {
        files: [],
        errors: [],
    };

    const sourceFileAnalyzer = new SourceFileAnalyzer();

    for (const filePath of batch) {
        try {
            const normalizedPath = path
                .resolve(rootDir, filePath)
                .replace(/\\/g, '/');

            const analysis = await sourceFileAnalyzer.analyzeSourceFile(
                rootDir,
                filePath,
                normalizedPath,
            );

            results.files.push({
                filePath,
                normalizedPath,
                analysis,
            });
        } catch (error) {
            console.error(`Error analyzing file ${filePath}:`, error);
            results.errors.push(
                `Error analyzing file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    return results;
}
