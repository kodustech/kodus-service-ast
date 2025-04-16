import { GrpcError } from 'kodus-proto';

export function isError(error: unknown): error is Error {
    return error instanceof Error;
}

export function handleError(error: unknown): Error {
    if (isError(error)) {
        return error;
    }
    return new Error('Unknown error');
}

export function errorToGrpc(error: unknown): GrpcError {
    return {
        code: 500,
        message: handleError(error).message,
    };
}
