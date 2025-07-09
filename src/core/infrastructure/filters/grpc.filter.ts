// src/grpc-exception.filter.ts

import { Catch, RpcExceptionFilter } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

@Catch()
export class GrpcExceptionFilter implements RpcExceptionFilter<any> {
    catch(exception: any): Observable<any> {
        // 1. If the exception is already an RpcException, just re-throw it.
        if (exception instanceof RpcException) {
            return throwError(() => exception.getError());
        }

        // 2. If it's a standard Error, or any other type of exception,
        //    log the original error for debugging purposes.
        console.error('An unexpected error occurred:', exception);

        // 3. Convert the unknown exception into a standard RpcException.
        //    This ensures the gRPC client receives a consistent error format.
        const grpcException = new RpcException({
            code: status.INTERNAL, // gRPC status code for internal errors
            message: 'An internal server error occurred.',
        });

        return throwError(() => grpcException.getError());
    }
}
