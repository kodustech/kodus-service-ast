export function isError(error: unknown): error is Error {
    return error instanceof Error;
}

export function handleError(error: unknown): Error {
    if (isError(error)) {
        return error;
    }
    return new Error('Unknown error');
}
