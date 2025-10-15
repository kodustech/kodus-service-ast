import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from '../modules/worker.module.js';

async function bootstrap(): Promise<void> {
    console.log('[WORKER] Starting bootstrap function...');
    console.log('[WORKER] Calling NestFactory.createApplicationContext...');
    const app = await NestFactory.createApplicationContext(WorkerModule, {
        logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
    console.log('[WORKER] Application context created');
    await app.init();
    console.log('[WORKER] app.init() resolved');
    console.log('[WORKER] Worker is ready');

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
