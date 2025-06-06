import { HttpStatus } from '@nestjs/common';
import { status as Status } from '@grpc/grpc-js';

export const GRPC_CODE_FROM_HTTP: Record<number, number> = {
    [HttpStatus.OK]: Status.OK,
    [HttpStatus.BAD_GATEWAY]: Status.UNKNOWN,
    [HttpStatus.UNPROCESSABLE_ENTITY]: Status.INVALID_ARGUMENT,
    [HttpStatus.REQUEST_TIMEOUT]: Status.DEADLINE_EXCEEDED,
    [HttpStatus.NOT_FOUND]: Status.NOT_FOUND,
    [HttpStatus.CONFLICT]: Status.ALREADY_EXISTS,
    [HttpStatus.FORBIDDEN]: Status.PERMISSION_DENIED,
    [HttpStatus.TOO_MANY_REQUESTS]: Status.RESOURCE_EXHAUSTED,
    [HttpStatus.PRECONDITION_REQUIRED]: Status.FAILED_PRECONDITION,
    [HttpStatus.METHOD_NOT_ALLOWED]: Status.ABORTED,
    [HttpStatus.PAYLOAD_TOO_LARGE]: Status.OUT_OF_RANGE,
    [HttpStatus.NOT_IMPLEMENTED]: Status.UNIMPLEMENTED,
    [HttpStatus.INTERNAL_SERVER_ERROR]: Status.INTERNAL,
    [HttpStatus.UNAUTHORIZED]: Status.UNAUTHENTICATED,
};

export const HTTP_CODE_FROM_GRPC: Record<number, number> = {
    [Status.OK]: HttpStatus.OK,
    [Status.CANCELLED]: HttpStatus.METHOD_NOT_ALLOWED,
    [Status.UNKNOWN]: HttpStatus.BAD_GATEWAY,
    [Status.INVALID_ARGUMENT]: HttpStatus.UNPROCESSABLE_ENTITY,
    [Status.DEADLINE_EXCEEDED]: HttpStatus.REQUEST_TIMEOUT,
    [Status.NOT_FOUND]: HttpStatus.NOT_FOUND,
    [Status.ALREADY_EXISTS]: HttpStatus.CONFLICT,
    [Status.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
    [Status.RESOURCE_EXHAUSTED]: HttpStatus.TOO_MANY_REQUESTS,
    [Status.FAILED_PRECONDITION]: HttpStatus.PRECONDITION_REQUIRED,
    [Status.ABORTED]: HttpStatus.METHOD_NOT_ALLOWED,
    [Status.OUT_OF_RANGE]: HttpStatus.PAYLOAD_TOO_LARGE,
    [Status.UNIMPLEMENTED]: HttpStatus.NOT_IMPLEMENTED,
    [Status.INTERNAL]: HttpStatus.INTERNAL_SERVER_ERROR,
    [Status.UNAVAILABLE]: HttpStatus.NOT_FOUND,
    [Status.DATA_LOSS]: HttpStatus.INTERNAL_SERVER_ERROR,
    [Status.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
};
