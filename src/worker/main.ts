import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from '../modules/worker.module.js';
import { type INestApplicationContext } from '@nestjs/common';

async function bootstrap(): Promise<void> {
    let app: INestApplicationContext;
    try {
        console.log('[WORKER] Starting bootstrap function...');
        console.log('[WORKER] Calling NestFactory.createApplicationContext...');
        app = await NestFactory.createApplicationContext(WorkerModule, {
            logger: ['log', 'error', 'warn', 'debug', 'verbose'],
        });
        console.log('[WORKER] Application context created');

        console.log('[WORKER] Calling app.init()...');
        await app.init();
        console.log('[WORKER] app.init() resolved');

        console.log('[WORKER] Waiting 2 seconds for RabbitMQ setup...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log('[WORKER] Wait completed');

        console.log('[WORKER] Worker is ready');
    } catch (error) {
        console.error('[WORKER] Error during bootstrap:', error);
        throw error;
    }

    const shutdown = async (signal: NodeJS.Signals) => {
        try {
            await app.close();
            console.log('[WORKER] Worker shutdown complete', signal);
        } catch (error) {
            console.error('[WORKER] Error during worker shutdown:', error);
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
