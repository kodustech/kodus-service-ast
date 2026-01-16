import './shared/utils/env-loader.js';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import {
    getEnvVariableAsNumberOrExit,
    getEnvVariableOrExit,
} from './shared/utils/env.js';
import { AppModule } from './modules/app.module.js';
import { PinoLoggerService } from './core/infrastructure/adapters/services/logger/pino.service.js';
import { GlobalExceptionFilter } from './core/infrastructure/http/filters/global-exception.filter.js';
import { RequestLoggerInterceptor } from './core/infrastructure/http/interceptors/request-logger.interceptor.js';

// Bootstrap logger for early logging (before NestJS app is ready)
const bootstrapLogger = PinoLoggerService.createBootstrapLogger();

// Setup error handlers early, before any code that might throw
PinoLoggerService.setupBootstrapErrorHandlers(bootstrapLogger);

async function bootstrap() {
    const containerName = getEnvVariableOrExit('CONTAINER_NAME');
    const apiPort = getEnvVariableAsNumberOrExit('API_PORT');

    /* ------------ validação simples de intervalo ---------------- */
    if (apiPort < 1 || apiPort > 65535) {
        bootstrapLogger.error(
            { containerName, apiPort },
            'API_PORT must be a value between 1 and 65535',
        );
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

    // Global exception filter for proper error logging
    app.useGlobalFilters(app.get(GlobalExceptionFilter));

    // Global request/response logging (timing + errors)
    app.useGlobalInterceptors(app.get(RequestLoggerInterceptor));

    app.enableShutdownHooks(['SIGINT', 'SIGTERM']); // graceful shutdown

    await app.listen(apiPort, '0.0.0.0');

    const logger = app.get(PinoLoggerService);
    logger.log({
        message: 'HTTP API started',
        context: 'Bootstrap',
        serviceName: 'KodusAST',
        metadata: {
            containerName,
            apiPort,
            healthUrl: `http://localhost:${apiPort}/health`,
        },
    });

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
        'Fatal error during bootstrap',
    );
    bootstrapLogger.flush(); // Ensure log is written before exit
    process.exit(1);
});
