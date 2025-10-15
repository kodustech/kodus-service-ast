import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import {
    getEnvVariableAsNumberOrExit,
    getEnvVariableOrExit,
} from './shared/utils/env.js';
import { AppModule } from './modules/app.module.js';
import { PinoLoggerService } from './core/infrastructure/adapters/services/logger/pino.service.js';

async function bootstrap() {
    const containerName = getEnvVariableOrExit('CONTAINER_NAME');
    const apiPort = getEnvVariableAsNumberOrExit('API_PORT');

    /* ------------ validação simples de intervalo ---------------- */
    if (apiPort < 1 || apiPort > 65535) {
        console.error('API_PORT must be a value between 1 and 65535');
        process.exit(1);
    }
    /* ------------------------------------------------------------ */

    /* HTTP REST API (porta única com /health otimizado) */
    const app = await NestFactory.create(AppModule);

    // /health sem prefixo /api (ex: http://localhost:3002/health)
    // Outros endpoints com /api (ex: http://localhost:3002/api/ast/graphs)
    app.setGlobalPrefix('api', {
        exclude: [
            { path: 'health', method: RequestMethod.GET },
            { path: 'health/detail', method: RequestMethod.GET },
        ],
    });

    app.useLogger(app.get(PinoLoggerService));
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']); // graceful shutdown

    await app.listen(apiPort, '0.0.0.0');

    console.log(`HTTP API    => ${containerName}:${apiPort}`);
    console.log(`Health      => http://localhost:${apiPort}/health`);

    // Avise PM2 que o processo está pronto (wait_ready)
    if (typeof process.send === 'function') {
        process.send('ready');
    }
}

bootstrap().catch((error) => {
    console.error('Fatal error during bootstrap:', error);
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
