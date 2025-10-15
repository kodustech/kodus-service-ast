// src/core/infrastructure/queue/queue.module.worker.ts
import { Module } from '@nestjs/common';
import {
    RabbitMQModule,
    MessageHandlerErrorBehavior,
} from '@golevelup/nestjs-rabbitmq';
import { QueueConfigModule } from './queue-config.module.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import { type RabbitMqConfig } from './rabbit.config.js';
import { getEnvVariable } from '@/shared/utils/env.js';

const ENABLE_SAC = (getEnvVariable('RABBIT_SAC') ?? 'false') === 'true';
const DELIVERY_LIMIT = Number(getEnvVariable('RABBIT_DELIVERY_LIMIT') ?? '5');

@Module({
    imports: [
        QueueConfigModule, // <-- disponibiliza o token no módulo
        RabbitMQModule.forRootAsync({
            imports: [QueueConfigModule], // <-- disponibiliza o token no contexto do módulo dinâmico
            inject: [RABBITMQ_CONFIG],
            useFactory: (cfg: RabbitMqConfig) => ({
                name: cfg.connectionName,
                uri: cfg.url,
                prefetchCount: cfg.prefetch ?? 1,
                channels: {
                    consumer: {
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
                queues: [
                    {
                        name: cfg.deadLetterQueue,
                        createQueueIfNotExists: true,
                        options: {
                            durable: true,
                            arguments: { 'x-queue-type': 'quorum' },
                        },
                        exchange: cfg.deadLetterExchange,
                        routingKey: '#',
                    },
                    // + dentro de queues: [ ... ] em queue.module.worker.ts
                    {
                        name: 'ast.test.echo.q',
                        createQueueIfNotExists: true,
                        options: {
                            durable: true,
                            arguments: {
                                'x-queue-type': 'quorum',
                                'x-dead-letter-exchange':
                                    cfg.deadLetterExchange,
                            },
                        },
                        exchange: cfg.exchange,
                        routingKey: 'ast.test.echo',
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
                                              cfg.exchange,
                                      },
                                  },
                              },
                          ]
                        : []),
                    {
                        name: 'ast.initialize.repo.q',
                        createQueueIfNotExists: true,
                        options: {
                            durable: true,
                            arguments: {
                                'x-queue-type': 'quorum',
                                'x-dead-letter-exchange':
                                    cfg.deadLetterExchange,
                                'x-delivery-limit': DELIVERY_LIMIT,
                                ...(ENABLE_SAC
                                    ? { 'x-single-active-consumer': true }
                                    : {}),
                            },
                        },
                        exchange: cfg.exchange,
                        routingKey: 'ast.initialize.repo',
                    },
                    {
                        name: 'ast.initialize.impact.q',
                        createQueueIfNotExists: true,
                        options: {
                            durable: true,
                            arguments: {
                                'x-queue-type': 'quorum',
                                'x-dead-letter-exchange':
                                    cfg.deadLetterExchange,
                                'x-delivery-limit': DELIVERY_LIMIT,
                                ...(ENABLE_SAC
                                    ? { 'x-single-active-consumer': true }
                                    : {}),
                            },
                        },
                        exchange: cfg.exchange,
                        routingKey: 'ast.initialize.impact',
                    },
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
