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
    const grpcPort = getEnvVariableAsNumberOrExit('API_PORT'); // 3002
    const healthPort = getEnvVariableAsNumberOrExit('API_HEALTH_PORT'); // 5001

    /* ------------ validação simples de intervalo ---------------- */
    for (const [name, value] of Object.entries({ grpcPort, healthPort })) {
        if (value < 1 || value > 65535) {
            console.error(`${name} deve estar entre 1 e 65535`);
            process.exit(1);
        }
    }
    if (grpcPort === healthPort) {
        console.error('API_PORT e API_HEALTH_PORT não podem ser iguais');
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
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.GRPC,
        options: {
            url: `0.0.0.0:${grpcPort}`,
            package: 'kodus.ast.v2',
            protoPath: resolve(
                cwd(),
                'node_modules/@kodus/kodus-proto/kodus/ast/v2/analyzer.proto',
            ),
            credentials: ServerCredentials.createInsecure(), // plaintext
            loader: {
                includeDirs: [join(cwd(), 'node_modules/@kodus/kodus-proto')],
            },
        },
    });

    /* 3. Logger, shutdown hooks e start */
    app.useLogger(app.get(PinoLoggerService));
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']); // graceful shutdown

    await app.startAllMicroservices();
    console.log(`HTTP health => ${containerName}:${healthPort}`);
    console.log(`gRPC        => ${containerName}:${grpcPort}`);

    /* 4. Avise PM2 que o processo está pronto (wait_ready) */
    if (typeof process.send === 'function') {
        process.send('ready');
    }
}
void bootstrap();
