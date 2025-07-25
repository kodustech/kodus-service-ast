import type { status as GrpcStatusCode } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { GrpcUnknownException } from './exceptions';
import { handleError } from '../errors';

export type GrpcExceptionPayload = {
    message: string;
    code: GrpcStatusCode | number;
};

/**
 * generates the grpc error object
 * @param {string | object} error - The error message or payload
 * @param {GrpcStatusCode} code - The grpc error code ("import type { status } from "@grpc/grpc-js")
 * @returns {GrpcExceptionPayload}
 */
export function errorObject(
    error: string | object,
    code: GrpcStatusCode,
): GrpcExceptionPayload {
    return {
        message: JSON.stringify({
            error,
            type: typeof error === 'string' ? 'string' : 'object',
            exceptionName: RpcException.name,
        }),
        code,
    };
}

export function throwGrpcOrUnknownException(error: any): never {
    if (error instanceof RpcException) {
        throw error;
    } else {
        throw new GrpcUnknownException(handleError(error));
    }
}
