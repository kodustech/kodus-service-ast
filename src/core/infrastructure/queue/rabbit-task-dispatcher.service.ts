import { ChannelModel, ConfirmChannel, connect } from 'amqplib';
import { once } from 'node:events';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import {
    ITaskJobDispatcher,
    DispatchTaskPayload,
} from '@/core/application/services/task/task.service.js';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { type RabbitMqConfig } from './rabbit.config.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import { handleError } from '@/shared/utils/errors.js';
import {
    ensureTaskQueueTopology,
    resolveRoutingKey,
} from './task-queue.definition.js';

interface PublishMessage {
    taskId: string;
    type: string;
    payload: unknown;
    metadata?: Record<string, unknown>;
    priority?: number;
    retryCount: number;
    createdAt: string;
}

@Injectable()
export class RabbitTaskDispatcher
    implements ITaskJobDispatcher, OnModuleDestroy
{
    private readonly config: RabbitMqConfig;
    private connection: ChannelModel | null = null;
    private channel: ConfirmChannel | null = null;
    private connectionPromise: Promise<ConfirmChannel> | null = null;

    constructor(
        private readonly logger: PinoLoggerService,
        @Inject(RABBITMQ_CONFIG) config: RabbitMqConfig,
    ) {
        this.config = config;
    }

    async dispatch<TPayload>(
        payload: DispatchTaskPayload<TPayload>,
    ): Promise<void> {
        if (!this.config.enabled) {
            throw new Error(
                'RabbitMQ dispatcher is disabled; ensure RABBIT_URL is set',
            );
        }

        const channel = await this.ensureChannel();
        const message = this.buildMessage(payload);
        const { routingKey, isFallback } = resolveRoutingKey(payload.type);

        this.logger.debug({
            context: RabbitTaskDispatcher.name,
            message: 'Publishing task to RabbitMQ',
            metadata: {
                taskId: payload.taskId,
                type: payload.type,
                routingKey,
            },
        });

        if (isFallback) {
            this.logger.warn({
                context: RabbitTaskDispatcher.name,
                message:
                    'Task type without explicit routing; using fallback key',
                metadata: {
                    taskId: payload.taskId,
                    type: payload.type,
                    routingKey,
                },
            });
        }

        try {
            const publishOk = channel.publish(
                this.config.exchange,
                routingKey,
                Buffer.from(JSON.stringify(message)),
                {
                    contentType: 'application/json',
                    contentEncoding: 'utf-8',
                    persistent: true,
                    headers: {
                        'x-task-id': payload.taskId,
                        'x-task-type': payload.type,
                        'x-retry-count': 0,
                        ...payload.metadata,
                    },
                },
            );

            if (!publishOk) {
                await once(channel, 'drain');
            }

            await this.awaitPublishConfirm(channel);
        } catch (error) {
            const normalized = handleError(error);
            this.logger.error({
                context: RabbitTaskDispatcher.name,
                message: 'Failed to publish task to RabbitMQ',
                error: normalized,
                metadata: {
                    taskId: payload.taskId,
                    type: payload.type,
                    routingKey,
                },
            });
            throw normalized;
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.close();
    }

    private buildMessage<TPayload>(
        payload: DispatchTaskPayload<TPayload>,
    ): PublishMessage {
        return {
            taskId: payload.taskId,
            type: payload.type,
            payload: payload.payload,
            metadata: payload.metadata,
            priority: payload.priority,
            retryCount: 0,
            createdAt: new Date().toISOString(),
        };
    }

    private async ensureChannel(): Promise<ConfirmChannel> {
        if (this.channel) {
            return this.channel;
        }

        if (!this.connectionPromise) {
            this.connectionPromise = this.createConnection();
        }

        this.channel = await this.connectionPromise;
        return this.channel;
    }

    private async createConnection(): Promise<ConfirmChannel> {
        try {
            const connection = await connect(this.config.url, {
                clientProperties: {
                    connection_name: this.config.connectionName,
                },
            });
            this.connection = connection;

            connection.on('error', (error) => {
                const normalized = handleError(error);
                this.logger.error({
                    context: RabbitTaskDispatcher.name,
                    message: 'RabbitMQ connection error',
                    error: normalized,
                    metadata: { url: this.config.url },
                });
            });

            connection.on('close', () => {
                this.logger.warn({
                    context: RabbitTaskDispatcher.name,
                    message: 'RabbitMQ connection closed',
                    metadata: { url: this.config.url },
                });
                this.channel = null;
                this.connection = null;
                this.connectionPromise = null;
            });

            const channel = await connection.createConfirmChannel();
            channel.on('error', (error) => {
                const normalized = handleError(error);
                this.logger.error({
                    context: RabbitTaskDispatcher.name,
                    message: 'RabbitMQ channel error',
                    error: normalized,
                    metadata: { url: this.config.url },
                });
            });
            channel.on('close', () => {
                this.logger.warn({
                    context: RabbitTaskDispatcher.name,
                    message: 'RabbitMQ channel closed',
                    metadata: { url: this.config.url },
                });
                this.channel = null;
                this.connectionPromise = null;
            });
            await ensureTaskQueueTopology(channel, this.config);
            return channel;
        } catch (error) {
            const normalized = handleError(error);
            this.logger.error({
                context: RabbitTaskDispatcher.name,
                message: 'Failed to connect to RabbitMQ',
                error: normalized,
                metadata: { url: this.config.url },
            });
            throw normalized;
        }
    }

    private async awaitPublishConfirm(channel: ConfirmChannel): Promise<void> {
        if (this.config.publishTimeoutMs <= 0) {
            await channel.waitForConfirms();
            return;
        }

        let timeout: NodeJS.Timeout | undefined;

        try {
            await Promise.race([
                channel.waitForConfirms(),
                new Promise<never>((_, reject) => {
                    timeout = setTimeout(() => {
                        reject(
                            new Error(
                                'Timed out waiting for RabbitMQ publish confirmation',
                            ),
                        );
                    }, this.config.publishTimeoutMs);
                }),
            ]);
        } finally {
            if (timeout) {
                clearTimeout(timeout);
            }
        }
    }

    private async close(): Promise<void> {
        try {
            if (this.channel) {
                await this.channel.close();
            }
            if (this.connection) {
                await this.connection.close();
            }
        } catch (error) {
            const normalized = handleError(error);
            this.logger.error({
                context: RabbitTaskDispatcher.name,
                message: 'Error closing RabbitMQ connection',
                error: normalized,
                metadata: { url: this.config.url },
            });
        } finally {
            this.channel = null;
            this.connection = null;
            this.connectionPromise = null;
        }
    }
}
