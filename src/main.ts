import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import {
    getEnvVariableAsNumber,
    getEnvVariableAsNumberOrExit,
    getEnvVariableOrExit,
} from './shared/utils/env.js';
import { AppModule } from './modules/app.module.js';
import { PinoLoggerService } from './core/infrastructure/adapters/services/logger/pino.service.js';

async function bootstrap() {
    const containerName = getEnvVariableOrExit('CONTAINER_NAME');
    const apiPort = getEnvVariableAsNumberOrExit('API_PORT');
    const healthPort = getEnvVariableAsNumber('API_HEALTH_PORT', apiPort);

    for (const [name, value] of Object.entries({
        apiPort,
        healthPort,
    })) {
        if (value && (value < 1 || value > 65535)) {
            console.error(`${name} must be a value between 1 and 65535`);
            process.exit(1);
        }
    }

    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api', {
        exclude: [{ path: 'health', method: RequestMethod.GET }],
    });
    app.useLogger(app.get(PinoLoggerService));
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']); // graceful shutdown

    await app.listen(apiPort, '0.0.0.0');
    console.log(`HTTP API => ${containerName}:${apiPort}`);
    if (healthPort && healthPort !== apiPort) {
        console.warn(
            'API_HEALTH_PORT is no longer used; the API and health endpoints respond on API_PORT.',
        );
    }

    /* 4. Avise PM2 que o processo está pronto (wait_ready) */
    if (typeof process.send === 'function') {
        process.send('ready');
    }
}
void bootstrap();
