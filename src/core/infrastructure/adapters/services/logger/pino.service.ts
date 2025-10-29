import { handleError } from '@/shared/utils/errors.js';
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
    private static handlersRegistered = false;

    private baseLogger = pino({
        level: process.env.API_LOG_LEVEL || 'info',
        base: {
            instance: process.env.NODE_APP_INSTANCE ?? '0',
            pid: false, // Not useful in containers/ECS - PID changes on restart
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        // Pino writes to process.stdout by default, which is correct for Docker/ECS
        // CloudWatch Logs Driver automatically captures stdout/stderr from containers
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
                    // In production, include stack trace for errors and preserve context/metadata
                    return {
                        message: object.message,
                        serviceName: object.serviceName,
                        context: object.context,
                        environment: object.environment,
                        error: object.error
                            ? {
                                  message: (object.error as Error)?.message,
                                  stack: (object.error as Error)?.stack,
                              }
                            : undefined,
                        // Include metadata if present (but already redacted)
                        ...(object.metadata &&
                        Object.keys(object.metadata).length > 0
                            ? { metadata: object.metadata }
                            : {}),
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
        // Flush immediately for critical errors to ensure logs aren't lost
        // This is important in containerized environments (Docker/ECS)
        this.baseLogger.flush();
    }

    /**
     * Public method to get the base logger for advanced usage
     * Useful for bootstrap logging before NestJS is ready
     */
    public static createBootstrapLogger(): pino.Logger {
        return pino({
            level: process.env.API_LOG_LEVEL || 'info',
            base: {
                instance: process.env.NODE_APP_INSTANCE ?? '0',
            },
            timestamp: pino.stdTimeFunctions.isoTime,
        });
    }

    /**
     * Setup error handlers for the application
     * Should be called early in bootstrap, before NestJS initialization
     * Uses static method to prevent multiple registrations
     */
    public static setupBootstrapErrorHandlers(
        bootstrapLogger: pino.Logger,
    ): void {
        if (PinoLoggerService.handlersRegistered) {
            return; // Prevent duplicate handlers
        }
        PinoLoggerService.handlersRegistered = true;

        process.on('uncaughtException', (error: Error) => {
            bootstrapLogger.error(
                {
                    err: {
                        message: error.message,
                        stack: error.stack,
                        name: error.name,
                    },
                },
                'Uncaught Exception',
            );
            bootstrapLogger.flush(); // Ensure log is written before exit
            process.exit(1);
        });

        process.on('unhandledRejection', (reason: unknown) => {
            const errorInfo =
                reason instanceof Error
                    ? {
                          message: reason.message,
                          stack: reason.stack,
                          name: reason.name,
                      }
                    : { reason: String(reason) };

            bootstrapLogger.error({ err: errorInfo }, 'Unhandled Rejection');
            bootstrapLogger.flush(); // Ensure log is written
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

        const logObject = this.buildLogObject(
            serviceName,
            contextStr,
            metadata,
            error,
        );

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
        serviceName: string | undefined,
        context: string,
        metadata: Record<string, any>,
        error?: unknown,
    ) {
        let err: Error | null = null;
        if (error) {
            err = handleError(error);
        }

        return {
            environment: process.env.API_NODE_ENV || 'unknown',
            serviceName: serviceName ?? 'UnknownService',
            context,
            ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
            error: err ? { message: err.message, stack: err.stack } : undefined,
        };
    }
}
