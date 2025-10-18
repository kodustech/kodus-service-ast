// queue.module.worker.ts (ajustado)
import { Module } from '@nestjs/common';
import {
    RabbitMQModule,
    MessageHandlerErrorBehavior,
} from '@golevelup/nestjs-rabbitmq';
import { QueueConfigModule } from './queue-config.module.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import type { RabbitMqConfig } from './rabbit.config.js';
import { QUEUE_CONFIG, getQueueRuntimeConfig } from './queue.constants.js';

const runtime = getQueueRuntimeConfig();

@Module({
    imports: [
        QueueConfigModule,
        RabbitMQModule.forRootAsync({
            imports: [QueueConfigModule],
            inject: [RABBITMQ_CONFIG],
            useFactory: (cfg: RabbitMqConfig) => ({
                name: cfg.connectionName,
                uri: cfg.url,
                prefetchCount: runtime.prefetch,
                channels: {
                    consumer: {
                        prefetchCount: runtime.prefetch,
                        default: true,
                    },
                },
                // 👇 exchanges só para validar existência (sem criar):
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
                // 👇 NÃO declare queues aqui; definitions.json já fez isso
                registerHandlers: true,
                defaultSubscribeErrorBehavior: MessageHandlerErrorBehavior.NACK, // nack => DLX decide
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
})
export class QueueModuleWorker {}
