import { Module } from '@nestjs/common';
import {
    RabbitMQModule,
    MessageHandlerErrorBehavior,
} from '@golevelup/nestjs-rabbitmq';
import { QueueConfigModule } from './queue-config.module.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import { type RabbitMqConfig } from './rabbit.config.js';
import { QUEUE_CONFIG, getQueueRuntimeConfig } from './queue.constants.js';

const runtimeConfig = getQueueRuntimeConfig();

@Module({
    imports: [
        QueueConfigModule, // <-- disponibiliza o token no módulo
        RabbitMQModule.forRootAsync({
            imports: [QueueConfigModule], // <-- disponibiliza o token no contexto do módulo dinâmico
            inject: [RABBITMQ_CONFIG],
            useFactory: (cfg: RabbitMqConfig) => ({
                name: cfg.connectionName,
                uri: cfg.url,
                prefetchCount: runtimeConfig.prefetch,
                channels: {
                    consumer: {
                        prefetchCount: runtimeConfig.prefetch,
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
                        name: QUEUE_CONFIG.EXCHANGE,
                        type: 'topic',
                        options: { durable: true },
                    },
                    {
                        name: QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
                        type: 'topic',
                        options: { durable: true },
                    },
                ],
                queues: [
                    {
                        name: QUEUE_CONFIG.DEAD_LETTER_QUEUE,
                        createQueueIfNotExists: true,
                        options: {
                            durable: true,
                            arguments: {
                                'x-queue-type': QUEUE_CONFIG.QUEUE_TYPE,
                            },
                        },
                        exchange: QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
                        routingKey: '#',
                    },
                    ...(cfg.retryQueue
                        ? [
                              {
                                  name: cfg.retryQueue,
                                  createQueueIfNotExists: true,
                                  options: {
                                      durable: true,
                                      arguments: {
                                          ...(cfg.retryTtlMs
                                              ? {
                                                    'x-message-ttl':
                                                        cfg.retryTtlMs,
                                                }
                                              : {}),
                                          'x-dead-letter-exchange':
                                              QUEUE_CONFIG.EXCHANGE,
                                      },
                                  },
                              },
                          ]
                        : []),
                ],
                registerHandlers: true,
                defaultSubscribeErrorBehavior: MessageHandlerErrorBehavior.NACK,
                enableDirectReplyTo: true,
            }),
        }),
    ],
    exports: [RabbitMQModule],
})
export class QueueModuleWorker {}
