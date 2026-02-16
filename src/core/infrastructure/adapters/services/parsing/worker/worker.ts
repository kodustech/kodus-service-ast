// worker/worker.ts

export type BatchWorkerInput = {
    batch: {
        id: string;
        content: string;
        filePath: string;
    }[];
};

export type SingleWorkerInput = {
    content: string;
    filePath: string;
};

export type WorkerInput = BatchWorkerInput | SingleWorkerInput;

export type WorkerOutput = {
    files: {
        filePath: string;
        normalizedPath: string;
        analysis: any;
    }[];
    errors: string[];
};

export async function analyzeBatch(
    params: BatchWorkerInput,
): Promise<WorkerOutput> {
    const { batch } = params;

    const { SourceFileAnalyzer } = await import('../analyze-source-file.js');
    const path = (await import('path')).default;

    const results: WorkerOutput = {
        files: [],
        errors: [],
    };

    const sourceFileAnalyzer = new SourceFileAnalyzer();

    for (const file of batch) {
        try {
            const normalizedPath = path
                .normalize(file.filePath)
                .replace(/\\/g, '/');

            const analysis = await sourceFileAnalyzer.analyzeSourceFile(
                file.filePath,
                normalizedPath,
                file.content,
            );

            results.files.push({
                filePath: file.filePath,
                normalizedPath,
                analysis,
            });
        } catch (error) {
            console.error(`Error analyzing file ${file.filePath}:`, error);
            results.errors.push(
                `Error analyzing file ${file.filePath}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    return results;
}

export async function analyzeContent(
    params: SingleWorkerInput,
): Promise<WorkerOutput> {
    const { content, filePath } = params;

    const { SourceFileAnalyzer } = await import('../analyze-source-file.js');
    const path = (await import('path')).default;

    const results: WorkerOutput = {
        files: [],
        errors: [],
    };

    const sourceFileAnalyzer = new SourceFileAnalyzer();

    try {
        const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');

        const analysis = await sourceFileAnalyzer.analyzeSourceFile(
            filePath,
            normalizedPath,
            content,
        );

        results.files.push({
            filePath,
            normalizedPath,
            analysis,
        });
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        console.error(`Error analyzing content for ${filePath}:`, error);
        results.errors.push(
            `Error analyzing content for ${filePath}: ${errorMessage}`,
        );
    }

    return results;
}
