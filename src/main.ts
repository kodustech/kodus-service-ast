import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { ServerCredentials } from '@grpc/grpc-js';
import { AppModule } from './modules/app.module';
import { resolve, join } from 'path';
import { cwd } from 'process';
import {
    getEnvVariableAsNumberOrExit,
    getEnvVariableOrExit,
} from './shared/utils/env';
import { PinoLoggerService } from './core/infrastructure/adapters/services/logger/pino.service';

async function bootstrap() {
    const containerName = getEnvVariableOrExit('CONTAINER_NAME');
    const grpcASTPort = getEnvVariableAsNumberOrExit('API_PORT');
    const healthPort = getEnvVariableAsNumberOrExit('API_HEALTH_PORT');

    /* ------------ validação simples de intervalo ---------------- */
    for (const [name, value] of Object.entries({
        grpcASTPort,
        healthPort,
    })) {
        if (value < 1 || value > 65535) {
            console.error(`${name} must be a value between 1 and 65535`);
            process.exit(1);
        }
    }

    if (grpcASTPort === healthPort) {
        console.error('API_PORT and API_HEALTH_PORT cannot be the same');
        process.exit(1);
    }
    /* ------------------------------------------------------------ */

    /* 1. HTTP app (apenas para health-check) */
    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api', {
        exclude: [{ path: 'health', method: RequestMethod.GET }],
    });

    await app.listen(healthPort, '0.0.0.0');

    /* 2. Microservice gRPC (plaintext) */
    app.connectMicroservice<MicroserviceOptions>(
        {
            transport: Transport.GRPC,
            options: {
                url: `0.0.0.0:${grpcASTPort}`,
                package: ['kodus.ast.v3', 'kodus.task.v1'],
                protoPath: [
                    resolve(
                        cwd(),
                        'node_modules/@kodus/kodus-proto/kodus/ast/v3/analyzer.proto',
                    ),
                    resolve(
                        cwd(),
                        'node_modules/@kodus/kodus-proto/kodus/task/v1/manager.proto',
                    ),
                ],
                credentials: ServerCredentials.createInsecure(), // plaintext
                loader: {
                    includeDirs: [
                        join(cwd(), 'node_modules/@kodus/kodus-proto'),
                    ],
                },
            },
        },
        {
            inheritAppConfig: true,
        },
    );

    /* 3. Logger, shutdown hooks e start */
    app.useLogger(app.get(PinoLoggerService));
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']); // graceful shutdown

    await app.startAllMicroservices();
    console.log(`HTTP health => ${containerName}:${healthPort}`);
    console.log(`gRPC AST    => ${containerName}:${grpcASTPort}`);
    console.log(`gRPC Task   => ${containerName}:${grpcASTPort}`);

    /* 4. Avise PM2 que o processo está pronto (wait_ready) */
    if (typeof process.send === 'function') {
        process.send('ready');
    }
}
void bootstrap();
