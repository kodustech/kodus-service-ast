// queue.module.worker.ts (ajustado)
import {
    MessageHandlerErrorBehavior,
    RabbitMQModule,
} from '@golevelup/nestjs-rabbitmq';
import { Module } from '@nestjs/common';
import { QueueConfigModule } from './queue-config.module.js';
import {
    QUEUE_CONFIG,
    buildTaskQueueOptions,
    getQueueRuntimeConfig,
} from './queue.constants.js';
import type { RabbitMqConfig } from './rabbit.config.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';

const runtime = getQueueRuntimeConfig();

@Module({
    imports: [
        QueueConfigModule,
        // Só importa RabbitMQ se estiver habilitado
        ...(process.env.API_RABBITMQ_ENABLED !== 'false'
            ? [
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
                                  createExchangeIfNotExists: true,
                                  options: { durable: true },
                              },
                              {
                                  name: QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
                                  type: 'topic',
                                  createExchangeIfNotExists: true,
                                  options: { durable: true },
                              },
                              {
                                  name: QUEUE_CONFIG.DELAYED_EXCHANGE,
                                  type: 'x-delayed-message',
                                  createExchangeIfNotExists: true,
                                  options: {
                                      durable: true,
                                      arguments: { 'x-delayed-type': 'topic' },
                                  },
                              },
                          ],
                          queues: [
                              // DLQ
                              {
                                  name: QUEUE_CONFIG.DEAD_LETTER_QUEUE,
                                  options: {
                                      durable: true,
                                      arguments: { 'x-queue-type': 'quorum' },
                                  },
                                  bindToExchange: {
                                      exchange:
                                          QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
                                      routingKey: '#',
                                  },
                              },
                              // Queues de Tasks
                              {
                                  name: QUEUE_CONFIG.REPO_ROUTING_KEY,
                                  options: buildTaskQueueOptions({
                                      enableSingleActiveConsumer: true,
                                  }),
                                  bindToExchange: {
                                      exchange: QUEUE_CONFIG.EXCHANGE,
                                      routingKey: QUEUE_CONFIG.REPO_ROUTING_KEY,
                                  },
                              },
                              {
                                  name: QUEUE_CONFIG.IMPACT_ROUTING_KEY,
                                  options: buildTaskQueueOptions({
                                      enableSingleActiveConsumer: true,
                                  }),
                                  bindToExchange: {
                                      exchange: QUEUE_CONFIG.EXCHANGE,
                                      routingKey:
                                          QUEUE_CONFIG.IMPACT_ROUTING_KEY,
                                  },
                              },
                              {
                                  name: QUEUE_CONFIG.VALIDATE_CODE_ROUTING_KEY,
                                  options: buildTaskQueueOptions({
                                      enableSingleActiveConsumer: true,
                                  }),
                                  bindToExchange: {
                                      exchange: QUEUE_CONFIG.EXCHANGE,
                                      routingKey:
                                          QUEUE_CONFIG.VALIDATE_CODE_ROUTING_KEY,
                                  },
                              },
                          ],
                          registerHandlers: true,
                          defaultSubscribeErrorBehavior:
                              MessageHandlerErrorBehavior.NACK, // nack => DLX decide
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
              ]
            : []),
    ],
})
export class QueueModuleWorker {}
