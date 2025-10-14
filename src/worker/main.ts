import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from '../modules/worker.module.js';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';

const WORKER_CONTEXT = 'AstWorkerBootstrap';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.createApplicationContext(WorkerModule, {
        logger: false,
    });

    const logger = app.get(PinoLoggerService);

    logger.log({
        context: WORKER_CONTEXT,
        message: 'AST worker started',
        serviceName: WORKER_CONTEXT,
    });

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
}

void bootstrap();
