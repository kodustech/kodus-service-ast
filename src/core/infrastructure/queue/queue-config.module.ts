// src/core/infrastructure/queue/queue-config.module.ts
import { Global, Module } from '@nestjs/common';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import { loadRabbitMqConfig } from './rabbit.config.js';
import { getEnvVariable } from '@/shared/utils/env.js';

const DEFAULT_SERVICE_NAME = 'kodus-service-ast';

@Global()
@Module({
    providers: [
        {
            provide: RABBITMQ_CONFIG,
            useFactory: () => {
                const serviceName =
                    getEnvVariable('SERVICE_NAME') ??
                    getEnvVariable('CONTAINER_NAME') ??
                    DEFAULT_SERVICE_NAME;
                return loadRabbitMqConfig(serviceName);
            },
        },
    ],
    exports: [RABBITMQ_CONFIG],
})
export class QueueConfigModule {}
