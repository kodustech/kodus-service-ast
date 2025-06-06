import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { errorObject } from './errors';

export class GrpcAbortedException extends RpcException {
    constructor(error: string | object) {
        super(errorObject(error, status.ABORTED));
    }
}

export class GrpcAlreadyExistsException extends RpcException {
    constructor(error: string | object) {
        super(errorObject(error, status.ALREADY_EXISTS));
    }
}

export class GrpcCancelledException extends RpcException {
    constructor(error: string | object) {
        super(errorObject(error, status.CANCELLED));
    }
}

export class GrpcInternalException extends RpcException {
    constructor(error: string | object) {
        super(errorObject(error, status.INTERNAL));
    }
}

export class GrpcInvalidArgumentException extends RpcException {
    constructor(error: string | object) {
        super(errorObject(error, status.INVALID_ARGUMENT));
    }
}

export class GrpcNotFoundException extends RpcException {
    constructor(error: string | object) {
        super(errorObject(error, status.NOT_FOUND));
    }
}

export class GrpcPermissionDeniedException extends RpcException {
    constructor(error: string | object) {
        super(errorObject(error, status.PERMISSION_DENIED));
    }
}

export class GrpcResourceExhaustedException extends RpcException {
    constructor(error: string | object) {
        super(errorObject(error, status.RESOURCE_EXHAUSTED));
    }
}

export class GrpcUnauthenticatedException extends RpcException {
    constructor(error: string | object) {
        super(errorObject(error, status.UNAUTHENTICATED));
    }
}

export class GrpcUnavailableException extends RpcException {
    constructor(error: string | object) {
        super(errorObject(error, status.UNAVAILABLE));
    }
}

export class GrpcUnknownException extends RpcException {
    constructor(error: string | object) {
        super(errorObject(error, status.UNKNOWN));
    }
}
