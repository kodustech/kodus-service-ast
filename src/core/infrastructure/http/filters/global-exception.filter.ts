import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLoggerService } from '../../adapters/services/logger/pino.service.js';

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    constructor(private readonly logger: PinoLoggerService) {}

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        // Determine status code and message
        let status: number;
        let message: string;
        let errorType: string;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            message =
                typeof exceptionResponse === 'string'
                    ? exceptionResponse
                    : (exceptionResponse as any)?.message || exception.message;
            errorType = 'HTTP_EXCEPTION';
        } else {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            message = 'Internal server error';
            errorType = 'UNKNOWN_ERROR';
        }

        // Extract error details
        const errorDetails = this.extractErrorDetails(exception);

        // Log the error with full context
        this.logger.error({
            message: 'HTTP request failed',
            context: 'GlobalExceptionFilter',
            serviceName: 'KodusAST',
            error: {
                message: errorDetails.message,
                stack: errorDetails.stack,
                name: errorDetails.name,
                type: errorType,
            },
            metadata: {
                method: request.method,
                url: request.url,
                userAgent: request.get('User-Agent'),
                ip: request.ip,
                statusCode: status,
                timestamp: new Date().toISOString(),
                body: this.sanitizeRequestBody(request.body),
                query: request.query,
                params: request.params,
            },
        });

        // Send response
        response.status(status).json({
            statusCode: status,
            message,
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }

    private extractErrorDetails(exception: unknown): {
        message: string;
        stack?: string;
        name?: string;
    } {
        if (exception instanceof Error) {
            return {
                message: exception.message,
                stack: exception.stack,
                name: exception.name,
            };
        }

        if (typeof exception === 'string') {
            return { message: exception };
        }

        return {
            message: 'Unknown error occurred',
        };
    }

    private sanitizeRequestBody(body: any): any {
        if (!body || typeof body !== 'object') {
            return body;
        }

        // Create a copy and remove sensitive fields
        const sanitized = { ...body };
        const sensitiveFields = [
            'password',
            'token',
            'secret',
            'key',
            'authorization',
        ];

        for (const field of sensitiveFields) {
            if (field in sanitized) {
                sanitized[field] = '[REDACTED]';
            }
        }

        return sanitized;
    }
}
