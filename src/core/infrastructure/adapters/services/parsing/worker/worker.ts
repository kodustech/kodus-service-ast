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

function logWorkerEvent(
    level: 'warn' | 'error',
    message: string,
    metadata?: Record<string, unknown>,
): void {
    const payload = {
        timestamp: new Date().toISOString(),
        level,
        context: 'ParsingWorker',
        pid: process.pid,
        message,
        metadata,
    };

    const serialized = `${JSON.stringify(payload)}\n`;
    process.stderr.write(serialized);
}

function formatWorkerError(error: unknown): {
    message: string;
    name?: string;
    stack?: string;
} {
    if (error instanceof Error) {
        return {
            message: error.message,
            name: error.name,
            stack: error.stack,
        };
    }

    return {
        message: String(error),
    };
}

export async function analyzeBatch(
    params: BatchWorkerInput,
): Promise<WorkerOutput> {
    const startedAt = performance.now();
    const { batch } = params;

    if (!Array.isArray(batch)) {
        const message = 'Invalid batch input: expected an array';
        logWorkerEvent('error', message, {
            receivedType: typeof batch,
        });

        return {
            files: [],
            errors: [message],
        };
    }

    if (batch.length === 0) {
        return {
            files: [],
            errors: [],
        };
    }

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
            const parsedError = formatWorkerError(error);

            logWorkerEvent('error', 'Failed to analyze file in worker batch', {
                filePath: file.filePath,
                errorMessage: parsedError.message,
                errorName: parsedError.name,
                stack: parsedError.stack,
            });

            results.errors.push(
                `Error analyzing file ${file.filePath}: ${parsedError.message}`,
            );
        }
    }

    if (results.errors.length > 0) {
        logWorkerEvent('warn', 'Worker batch finished with errors', {
            batchSize: batch.length,
            analyzedFiles: results.files.length,
            errorsCount: results.errors.length,
            durationMs: Math.round(performance.now() - startedAt),
        });
    }

    return results;
}

export async function analyzeContent(
    params: SingleWorkerInput,
): Promise<WorkerOutput> {
    const startedAt = performance.now();
    const { content, filePath } = params;

    if (typeof filePath !== 'string' || filePath.length === 0) {
        const message = 'Invalid filePath for worker analyzeContent';
        logWorkerEvent('error', message, {
            filePath,
        });

        return {
            files: [],
            errors: [message],
        };
    }

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
        const parsedError = formatWorkerError(error);

        logWorkerEvent('error', 'Failed to analyze single content in worker', {
            filePath,
            errorMessage: parsedError.message,
            errorName: parsedError.name,
            stack: parsedError.stack,
            durationMs: Math.round(performance.now() - startedAt),
        });

        results.errors.push(
            `Error analyzing content for ${filePath}: ${parsedError.message}`,
        );
    }

    return results;
}
