/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { ExecutionContext, Injectable } from '@nestjs/common';
import pino from 'pino';
import { pid } from 'process';

type LogLevel = 'info' | 'error' | 'warn' | 'debug' | 'verbose';

interface LogArguments {
    message: string;
    context: ExecutionContext | string;
    serviceName?: string;
    error?: Error;
    metadata?: Record<string, any>;
}

const isProduction =
    (process.env.API_NODE_ENV || 'production') === 'production';
const shouldPrettyPrint = (process.env.API_LOG_PRETTY || 'false') === 'true';

@Injectable()
export class PinoLoggerService {
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
            log(object: any) {
                if (isProduction && !shouldPrettyPrint) {
                    // Cleaner log for production
                    return {
                        message: object.message,
                        serviceName: object.serviceName,
                        environment: object.environment,
                        error: object.error
                            ? { message: object?.error?.message }
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
        } catch (error) {
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

        // Now we are correctly calling `createChildLogger`
        const childLogger = this.createChildLogger(
            serviceName || 'UnknownService',
            contextStr,
        );

        const logObject = this.buildLogObject(serviceName, metadata, error);

        // Using the `childLogger` to log the messages
        childLogger[level](logObject, message);
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
        error?: Error,
    ) {
        return {
            environment: process.env.API_NODE_ENV || 'unknown',
            serviceName,
            ...metadata,
            metadata,
            error: error
                ? { message: error.message, stack: error.stack }
                : undefined,
        };
    }
}
