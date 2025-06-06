import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './modules/app.module';
import { PinoLoggerService } from './core/infrastructure/adapters/services/logger/pino.service';
import { resolve } from 'path';
import { cwd } from 'process';
import {
    getEnvVariableAsNumberOrExit,
    getEnvVariableOrExit,
} from './shared/utils/env';

async function bootstrap() {
    const containerName = getEnvVariableOrExit('CONTAINER_NAME');
    const grpcNumberPort = getEnvVariableAsNumberOrExit('API_PORT');
    const healthNumberPort = getEnvVariableAsNumberOrExit('API_HEALTH_PORT');

    if (grpcNumberPort < 0 || grpcNumberPort > 65535) {
        console.error(
            'API_PORT environment variable is out of range (0-65535)',
        );
        process.exit(1);
    }

    if (healthNumberPort < 0 || healthNumberPort > 65535) {
        console.error(
            'API_HEALTH_PORT environment variable is out of range (0-65535)',
        );
        process.exit(1);
    }

    if (healthNumberPort === grpcNumberPort) {
        console.error('API_HEALTH_PORT and API_PORT cannot be the same port');
        process.exit(1);
    }

    // Inicializa a aplicação HTTP para health checks
    const httpApp = await NestFactory.create(AppModule);
    httpApp.setGlobalPrefix('api');

    // Inicia o servidor HTTP apenas para health checks
    await httpApp.listen(healthNumberPort, '0.0.0.0');

    httpApp.connectMicroservice<MicroserviceOptions>({
        transport: Transport.GRPC,
        options: {
            package: 'kodus.ast.v2',
            protoPath: resolve(
                cwd(),
                'node_modules/@kodus/kodus-proto/kodus/ast/v2/analyzer.proto',
            ),
            url: `0.0.0.0:${grpcNumberPort}`,
            loader: {
                includeDirs: [
                    resolve(cwd(), 'node_modules/@kodus/kodus-proto/'),
                ],
            },
        },
    });

    httpApp.useLogger(httpApp.get(PinoLoggerService));
    await httpApp.startAllMicroservices();
    console.log(
        `HTTP service is listening on ${containerName}:${healthNumberPort}`,
    );
    console.log(
        `gRPC service is listening on ${containerName}:${grpcNumberPort}`,
    );
}

void bootstrap();
