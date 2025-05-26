import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './modules/app.module';
import { PinoLoggerService } from './core/infrastructure/adapters/services/logger/pino.service';
import { resolve } from 'path';
import { cwd } from 'process';
import * as grpc from '@grpc/grpc-js';
import * as fs from 'fs';

async function bootstrap() {
    const hostName = process.env.CONTAINER_NAME;
    if (!hostName) {
        console.error('HOST environment variable is not set');
        process.exit(1);
    }

    const grpcPort = process.env.API_PORT;
    if (!grpcPort) {
        console.error('API_PORT environment variable is not set');
        process.exit(1);
    }
    const grpcNumberPort = Number(grpcPort);
    if (isNaN(grpcNumberPort)) {
        console.error('API_PORT environment variable is not a valid number');
        process.exit(1);
    }
    if (grpcNumberPort < 0 || grpcNumberPort > 65535) {
        console.error(
            'API_PORT environment variable is out of range (0-65535)',
        );
        process.exit(1);
    }

    // Cria o servidor HTTP para health checks
    const healthPort = process.env.API_HEALTH_PORT || '5001';
    const healthNumberPort = Number(healthPort);

    // Inicializa a aplicação HTTP para health checks
    const httpApp = await NestFactory.create(AppModule);
    httpApp.setGlobalPrefix('api');

    // Inicia o servidor HTTP apenas para health checks
    await httpApp.listen(healthNumberPort, '0.0.0.0');
    console.log(
        `Health check HTTP server is running on ${hostName}:${healthNumberPort}`,
    );

    // Inicializa o microserviço gRPC principal
    const grpcApp = await NestFactory.createMicroservice<MicroserviceOptions>(
        AppModule,
        {
            transport: Transport.GRPC,
            options: {
                package: 'kodus.ast.v1',
                protoPath: resolve(
                    cwd(),
                    'node_modules/@kodus/kodus-proto/kodus/ast/v1/analyzer.proto',
                ),
                url: `0.0.0.0:${grpcNumberPort}`,
                loader: {
                    includeDirs: [
                        resolve(cwd(), 'node_modules/@kodus/kodus-proto/'),
                    ],
                },
                credentials: grpc.ServerCredentials.createSsl(
                    fs.readFileSync(resolve(cwd(), 'certs/ca.crt')),
                    [
                        {
                            private_key: fs.readFileSync(
                                resolve(cwd(), 'certs/server.key'),
                            ),
                            cert_chain: fs.readFileSync(
                                resolve(cwd(), 'certs/server.crt'),
                            ),
                        },
                    ],
                    true,
                ),
            },
        },
    );

    const pinoLogger = grpcApp.get(PinoLoggerService);
    grpcApp.useLogger(pinoLogger);

    await grpcApp.listen();
    console.log(
        `AST gRPC service is listening on ${hostName}:${grpcNumberPort}`,
    );
}

void bootstrap();
