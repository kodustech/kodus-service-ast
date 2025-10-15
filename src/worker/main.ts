console.log('[WORKER] Loading dotenv...');
import 'dotenv/config';
console.log('[WORKER] Importing NestFactory...');
import { NestFactory } from '@nestjs/core';
console.log('[WORKER] Importing WorkerModule...');
import { WorkerMinModule as WorkerModule } from '../modules/worker.min.module.js';
console.log('[WORKER] Importing PinoLoggerService...');
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';

console.log('[WORKER] All imports loaded');

const WORKER_CONTEXT = 'AstWorkerBootstrap';

async function bootstrap(): Promise<void> {
    console.log('[WORKER] Starting bootstrap function...');
    console.log('[WORKER] Calling NestFactory.createApplicationContext...');

    // createApplicationContext is better for workers (no HTTP server)
    const app = await NestFactory.createApplicationContext(WorkerModule, {
        logger: ['log', 'error', 'warn', 'debug', 'verbose'], // mais verboso
    });

    console.log('[WORKER] Application context created');

    await app.init(); // reforça a fase de init

    console.log('[WORKER] app.init() resolved');
    console.log('[WORKER] Application context created');

    // Wait a bit for RabbitMQ to finish registering subscribers
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('[WORKER] After timeout');

    const logger = app.get(PinoLoggerService);

    logger.log({
        context: WORKER_CONTEXT,
        message: 'AST worker started and listening to RabbitMQ queues',
        serviceName: WORKER_CONTEXT,
    });
    console.log('[WORKER] Worker is ready');

    const shutdown = async (signal: NodeJS.Signals) => {
        logger.warn({
            context: WORKER_CONTEXT,
            message: `Received ${signal}; shutting down worker`,
            serviceName: WORKER_CONTEXT,
        });

        try {
            await app.close();
            logger.log({
                context: WORKER_CONTEXT,
                message: 'Worker shutdown complete',
                serviceName: WORKER_CONTEXT,
            });
        } catch (error) {
            logger.error({
                context: WORKER_CONTEXT,
                message: 'Error during worker shutdown',
                error,
                serviceName: WORKER_CONTEXT,
            });
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
    console.error('Fatal error during worker bootstrap:', error);
    process.exit(1);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
