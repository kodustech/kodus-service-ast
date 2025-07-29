export function isError(error: unknown): error is Error {
    return error instanceof Error;
}

export function isString(value: unknown): value is string {
    return typeof value === 'string' || value instanceof String;
}

export function handleError(error: unknown): Error {
    if (!error) {
        return null;
    }
    if (isError(error)) {
        return error;
    }
    if (isString(error)) {
        return new Error(error);
    }
    return new Error('Unknown error');
}
