import '../shared/utils/env-loader.js';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from '../modules/worker.module.js';
import { type INestApplicationContext } from '@nestjs/common';
import { PinoLoggerService } from '../core/infrastructure/adapters/services/logger/pino.service.js';

// Bootstrap logger for early logging (before NestJS app is ready)
const bootstrapLogger = PinoLoggerService.createBootstrapLogger();

// Setup error handlers early, before any code that might throw
PinoLoggerService.setupBootstrapErrorHandlers(bootstrapLogger);

async function bootstrap(): Promise<void> {
    let app: INestApplicationContext;
    try {
        bootstrapLogger.info('Starting worker bootstrap function...');
        app = await NestFactory.createApplicationContext(WorkerModule, {
            logger: ['log', 'error', 'warn', 'debug', 'verbose'],
        });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        const logger = app.get(PinoLoggerService);
        logger.log({
            message: 'Worker is ready',
            context: 'Bootstrap',
            serviceName: 'KodusASTWorker',
        });
    } catch (error) {
        bootstrapLogger.error(
            {
                err: error instanceof Error ? error : new Error(String(error)),
                stack: error instanceof Error ? error.stack : undefined,
            },
            'Error during bootstrap',
        );
        throw error;
    }

    const shutdown = async (signal: NodeJS.Signals) => {
        try {
            await app.close();
            bootstrapLogger.info({ signal }, 'Worker shutdown complete');
            bootstrapLogger.flush(); // Ensure log is written before exit
        } catch (error) {
            bootstrapLogger.error(
                {
                    err:
                        error instanceof Error
                            ? error
                            : new Error(String(error)),
                    stack: error instanceof Error ? error.stack : undefined,
                },
                'Error during worker shutdown',
            );
            bootstrapLogger.flush(); // Ensure log is written before exit
        } finally {
            process.exit(0);
        }
    };

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
            void shutdown(signal);
        });
    }

    // Avise PM2 que o processo está pronto (wait_ready)
    if (typeof process.send === 'function') {
        process.send('ready');
    }
}

bootstrap().catch((error) => {
    bootstrapLogger.error(
        {
            err: error instanceof Error ? error : new Error(String(error)),
            stack: error instanceof Error ? error.stack : undefined,
        },
        'Fatal error during worker bootstrap',
    );
    bootstrapLogger.flush(); // Ensure log is written before exit
    process.exit(1);
});
