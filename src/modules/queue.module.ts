import { Global, Module } from '@nestjs/common';
import { getEnvVariable } from '@/shared/utils/env.js';
import { loadRabbitMqConfig } from '@/core/infrastructure/queue/rabbit.config.js';
import { RABBITMQ_CONFIG } from '@/core/infrastructure/queue/rabbit.constants.js';
import { RabbitTaskDispatcher } from '@/core/infrastructure/queue/rabbit-task-dispatcher.service.js';
import { TASK_JOB_DISPATCHER } from '@/core/application/services/task/task.service.js';

const DEFAULT_SERVICE_NAME = 'kodus-service-ast-api';

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
        RabbitTaskDispatcher,
        {
            provide: TASK_JOB_DISPATCHER,
            useExisting: RabbitTaskDispatcher,
        },
    ],
    exports: [RabbitTaskDispatcher, TASK_JOB_DISPATCHER, RABBITMQ_CONFIG],
})
export class QueueModule {}
