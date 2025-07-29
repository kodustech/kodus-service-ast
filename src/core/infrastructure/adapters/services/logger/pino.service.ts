import { handleError } from '@/shared/utils/errors';
import { ExecutionContext, Injectable, LoggerService } from '@nestjs/common';
import pino from 'pino';

type LogLevel = 'info' | 'error' | 'warn' | 'debug' | 'verbose';

interface LogArguments {
    message: string;
    context: ExecutionContext | string;
    serviceName?: string;
    error?: unknown;
    metadata?: Record<string, any>;
}

const isProduction =
    (process.env.API_NODE_ENV || 'production') === 'production';
const shouldPrettyPrint = (process.env.API_LOG_PRETTY || 'false') === 'true';

@Injectable()
export class PinoLoggerService implements LoggerService {
    private baseLogger = pino({
        level: process.env.API_LOG_LEVEL || 'info',
        base: {
            instance: process.env.NODE_APP_INSTANCE ?? '0',
            pid: false,
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        transport:
            shouldPrettyPrint && !isProduction
                ? {
                      target: 'pino-pretty',
                      options: {
                          colorize: true,
                          translateTime: 'SYS:standard',
                          ignore: 'pid,hostname',
                          levelFirst: true,
                          errorProps: 'message,stack', // Includes the error stack in the output
                          messageFormat:
                              '{level} - {serviceName} - {context} - {msg}',
                      },
                  }
                : undefined,
        formatters: {
            level(label) {
                return { level: label };
            },
            log(object) {
                if (isProduction && !shouldPrettyPrint) {
                    return {
                        message: object.message,
                        serviceName: object.serviceName,
                        environment: object.environment,
                        error: object.error
                            ? {
                                  message: (object.error as Error)?.message,
                              }
                            : undefined,
                    };
                }
                return object;
            },
        },
        redact: [
            'password',
            'user.sensitiveInfo',
            'apiKey',
            'metadata.headers.authorization',
        ],
    });

    private extractContextInfo(context: ExecutionContext | string): string {
        if (typeof context === 'string') {
            return context;
        }
        // Se for ExecutionContext, tenta extrair a URL da requisição
        try {
            const request = context.switchToHttp().getRequest<Request>();
            return request.url || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    private createChildLogger(serviceName: string, context: string) {
        return this.baseLogger.child({
            serviceName,
            context,
        });
    }

    public log({
        message,
        context,
        serviceName,
        error,
        metadata,
    }: LogArguments) {
        this.handleLog('info', {
            message,
            context,
            serviceName,
            error,
            metadata,
        });
    }

    public error({
        message,
        context,
        serviceName,
        error,
        metadata,
    }: LogArguments) {
        this.handleLog('error', {
            message,
            context,
            serviceName,
            error,
            metadata,
        });
    }

    public warn({
        message,
        context,
        serviceName,
        error,
        metadata,
    }: LogArguments) {
        this.handleLog('warn', {
            message,
            context,
            serviceName,
            error,
            metadata,
        });
    }

    public debug({
        message,
        context,
        serviceName,
        error,
        metadata,
    }: LogArguments) {
        this.handleLog('debug', {
            message,
            context,
            serviceName,
            error,
            metadata,
        });
    }

    public verbose({
        message,
        context,
        serviceName,
        error,
        metadata,
    }: LogArguments) {
        this.handleLog('verbose', {
            message,
            context,
            serviceName,
            error,
            metadata,
        });
    }

    private handleLog(
        level: LogLevel,
        { message, context, serviceName, error, metadata = {} }: LogArguments,
    ) {
        if (this.shouldSkipLog(context)) {
            return;
        }

        const contextStr = this.extractContextInfo(context);

        const childLogger = this.createChildLogger(
            serviceName || 'UnknownService',
            contextStr,
        );

        const logObject = this.buildLogObject(serviceName, metadata, error);

        switch (level) {
            case 'info':
                childLogger.info(logObject, message);
                break;
            case 'error':
                childLogger.error(logObject, message);
                break;
            case 'warn':
                childLogger.warn(logObject, message);
                break;
            case 'debug':
                childLogger.debug(logObject, message);
                break;
            default:
                childLogger.info(logObject, message);
                break;
        }
    }

    private shouldSkipLog(context: ExecutionContext | string) {
        return (
            typeof context === 'undefined' ||
            (typeof context === 'string' &&
                ['RouterExplorer', 'RoutesResolver'].includes(context))
        );
    }

    private buildLogObject(
        serviceName: string,
        metadata: Record<string, any>,
        error?: unknown,
    ) {
        let err: Error;
        if (error) {
            err = handleError(error);
        }

        return {
            environment: process.env.API_NODE_ENV || 'unknown',
            serviceName,
            ...metadata,
            metadata,
            error: err ? { message: err.message, stack: err.stack } : undefined,
        };
    }
}
