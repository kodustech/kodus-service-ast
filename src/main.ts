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

    const port = process.env.API_PORT;
    if (!port) {
        console.error('PORT environment variable is not set');
        process.exit(1);
    }
    const numberPort = Number(port);
    if (isNaN(numberPort)) {
        console.error('PORT environment variable is not a valid number');
        process.exit(1);
    }
    if (numberPort < 0 || numberPort > 65535) {
        console.error('PORT environment variable is out of range (0-65535)');
        process.exit(1);
    }

    const app = await NestFactory.createMicroservice<MicroserviceOptions>(
        AppModule,
        {
            transport: Transport.GRPC,
            options: {
                package: 'kodus.ast.v1',
                protoPath: resolve(
                    cwd(),
                    'node_modules/@kodus/kodus-proto/kodus/ast/v1/analyzer.proto',
                ),
                url: `0.0.0.0:${numberPort}`,
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

    const pinoLogger = app.get(PinoLoggerService);
    app.useLogger(pinoLogger);

    await app.listen();
    console.log(`AST service is listening on ${hostName}:${numberPort}`);
}

void bootstrap();
