export function isError(error: unknown): error is Error {
    return error instanceof Error;
}

export function isString(value: unknown): value is string {
    return typeof value === 'string' || value instanceof String;
}

export function handleError(error: unknown): Error {
    if (!error) {
        return new Error('No error provided');
    }
    if (isError(error)) {
        return error;
    }
    if (isString(error)) {
        return new Error(error);
    }
    // Preserve the original error details for debugging
    return new Error(`Unknown error: ${JSON.stringify(error)}`);
}
