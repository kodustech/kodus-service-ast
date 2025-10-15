import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { QueueConfigModule } from './queue-config.module.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import type { RabbitMqConfig } from './rabbit.config.js';
import { RabbitTaskDispatcher } from './rabbit-task-dispatcher.service.js';
import { TASK_JOB_DISPATCHER } from '@/core/application/services/task/task.service.js';

@Module({
    imports: [
        QueueConfigModule,
        RabbitMQModule.forRootAsync({
            imports: [QueueConfigModule],
            inject: [RABBITMQ_CONFIG],
            useFactory: (cfg: RabbitMqConfig) => ({
                name: cfg.connectionName,
                uri: cfg.url,
                prefetchCount: cfg.prefetch ?? 1,
                channels: {
                    producer: {
                        prefetchCount: cfg.prefetch ?? 1,
                        default: true,
                    },
                },
                connectionInitOptions: {
                    wait: true,
                    timeout: 10_000,
                    reject: true,
                },
                connectionManagerOptions: {
                    heartbeatIntervalInSeconds: 30,
                    reconnectTimeInSeconds: 5,
                    connectionOptions: {
                        clientProperties: {
                            connection_name: cfg.connectionName,
                        },
                    },
                },
                exchanges: [
                    {
                        name: cfg.exchange,
                        type: 'topic',
                        options: { durable: true },
                    },
                    {
                        name: cfg.deadLetterExchange,
                        type: 'topic',
                        options: { durable: true },
                    },
                ],
                registerHandlers: false, // API só publica
                enableDirectReplyTo: true,
            }),
        }),
    ],
    providers: [
        // publisher usando AmqpConnection.publish(...)
        RabbitTaskDispatcher,
        { provide: TASK_JOB_DISPATCHER, useExisting: RabbitTaskDispatcher },
    ],
    exports: [RabbitMQModule, RabbitTaskDispatcher, TASK_JOB_DISPATCHER],
})
export class QueueModuleApi {}
