// queue.module.api.ts (ajustado)
import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { QueueConfigModule } from './queue-config.module.js';
import { QUEUE_CONFIG } from './queue.constants.js';
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
                prefetchCount: 0, // publisher não consome
                exchanges: [
                    {
                        name: QUEUE_CONFIG.EXCHANGE,
                        type: 'topic',
                        createExchangeIfNotExists: false,
                        options: { durable: true },
                    },
                    {
                        name: QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
                        type: 'topic',
                        createExchangeIfNotExists: false,
                        options: { durable: true },
                    },
                    {
                        name: QUEUE_CONFIG.DELAYED_EXCHANGE,
                        type: 'x-delayed-message',
                        createExchangeIfNotExists: false,
                        options: {
                            durable: true,
                            arguments: { 'x-delayed-type': 'topic' },
                        },
                    },
                ],
                registerHandlers: false,
                enableDirectReplyTo: false,
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
            }),
        }),
    ],
    providers: [
        RabbitTaskDispatcher,
        { provide: TASK_JOB_DISPATCHER, useExisting: RabbitTaskDispatcher },
    ],
    exports: [RabbitTaskDispatcher, TASK_JOB_DISPATCHER],
})
export class QueueModuleApi {}
