import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { PinoLoggerService } from '../../adapters/services/logger/pino.service.js';

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
    constructor(private readonly logger: PinoLoggerService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const now = Date.now();
        const http = context.switchToHttp();
        const request = http.getRequest<Request & { user?: any }>();

        const method = (request as any)?.method;
        const url = (request as any)?.url;
        const userAgent = (request as any)?.headers?.['user-agent'];

        this.logger.debug({
            message: 'HTTP request received',
            context: 'RequestLogger',
            serviceName: 'KodusAST',
            metadata: {
                method,
                url,
                userAgent,
            },
        });

        return next.handle().pipe(
            tap(() => {
                const elapsed = Date.now() - now;
                this.logger.debug({
                    message: 'HTTP request completed',
                    context: 'RequestLogger',
                    serviceName: 'KodusAST',
                    metadata: {
                        method,
                        url,
                        durationMs: elapsed,
                    },
                });
            }),
            catchError((err) => {
                const elapsed = Date.now() - now;
                this.logger.error({
                    message: 'HTTP request failed (interceptor)',
                    context: 'RequestLogger',
                    serviceName: 'KodusAST',
                    error: err,
                    metadata: {
                        method,
                        url,
                        durationMs: elapsed,
                    },
                });
                throw err;
            }),
        );
    }
}
