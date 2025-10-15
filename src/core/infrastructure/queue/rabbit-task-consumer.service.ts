import { Channel, ChannelModel, ConsumeMessage, connect } from 'amqplib';
import { handleError } from '@/shared/utils/errors.js';
import {
    ensureTaskQueueTopology,
    TaskQueueMessage,
    TASK_QUEUE_BINDINGS,
} from './task-queue.definition.js';
import {
    Inject,
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { type RabbitMqConfig } from './rabbit.config.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';

const WORKER_CONTEXT = 'RabbitTaskConsumer';

@Injectable()
export class RabbitTaskConsumer implements OnModuleInit, OnModuleDestroy {
    private connection: ChannelModel | null = null;
    private channel: Channel | null = null;
    private connectionPromise: Promise<Channel> | null = null;

    constructor(
        private readonly logger: PinoLoggerService,
        private readonly taskQueueProcessor: TaskQueueProcessor,
        @Inject(RABBITMQ_CONFIG)
        private readonly config: RabbitMqConfig,
    ) {}

    async onModuleInit(): Promise<void> {
        if (!this.config.enabled) {
            throw new Error(
                'RabbitMQ consumer is disabled; ensure RABBIT_URL is set',
            );
        }

        await this.ensureChannel();
        this.logger.log({
            context: WORKER_CONTEXT,
            message: 'RabbitMQ consumer ready',
            metadata: {
                exchange: this.config.exchange,
                queues: TASK_QUEUE_BINDINGS.map((binding) => binding.queue),
                prefetch: this.config.prefetch,
            },
            serviceName: WORKER_CONTEXT,
        });
    }

    async onModuleDestroy(): Promise<void> {
        await this.close();
    }

    private async ensureChannel(): Promise<Channel> {
        if (this.channel) {
            return this.channel;
        }

        if (!this.connectionPromise) {
            this.connectionPromise = this.createChannel();
        }

        this.channel = await this.connectionPromise;
        return this.channel;
    }

    private async createChannel(): Promise<Channel> {
        const connection = await connect(this.config.url, {
            clientProperties: {
                connection_name: this.config.connectionName,
            },
        });

        this.connection = connection;

        connection.on('error', (error) => {
            const normalized = handleError(error);
            this.logger.error({
                context: WORKER_CONTEXT,
                message: 'RabbitMQ connection error',
                error: normalized,
                metadata: { url: this.config.url },
                serviceName: WORKER_CONTEXT,
            });
        });

        connection.on('close', () => {
            this.logger.warn({
                context: WORKER_CONTEXT,
                message: 'RabbitMQ connection closed',
                metadata: { url: this.config.url },
                serviceName: WORKER_CONTEXT,
            });
            this.channel = null;
            this.connection = null;
            this.connectionPromise = null;
        });

        const channel = await connection.createChannel();
        channel.on('error', (error) => {
            const normalized = handleError(error);
            this.logger.error({
                context: WORKER_CONTEXT,
                message: 'RabbitMQ channel error',
                error: normalized,
                metadata: { url: this.config.url },
                serviceName: WORKER_CONTEXT,
            });
        });

        channel.on('close', () => {
            this.logger.warn({
                context: WORKER_CONTEXT,
                message: 'RabbitMQ channel closed',
                metadata: { url: this.config.url },
                serviceName: WORKER_CONTEXT,
            });
            this.channel = null;
            this.connectionPromise = null;
        });

        await ensureTaskQueueTopology(channel, this.config);
        await channel.prefetch(this.config.prefetch ?? 1, false);

        for (const binding of TASK_QUEUE_BINDINGS) {
            await channel.consume(
                binding.queue,
                (message) => {
                    void this.handleMessage(binding.queue, message);
                },
                { noAck: false },
            );
        }

        return channel;
    }

    private async handleMessage(
        queue: string,
        message: ConsumeMessage | null,
    ): Promise<void> {
        if (!message) {
            this.logger.warn({
                context: WORKER_CONTEXT,
                message: 'Consumer cancelled by server',
                metadata: { queue },
                serviceName: WORKER_CONTEXT,
            });
            return;
        }

        let job: TaskQueueMessage | null = null;
        try {
            job = JSON.parse(
                message.content.toString('utf-8'),
            ) as TaskQueueMessage;
        } catch (error) {
            const normalized = handleError(error);
            this.logger.error({
                context: WORKER_CONTEXT,
                message: 'Failed to parse task message; discarding',
                error: normalized,
                metadata: {
                    queue,
                    routingKey: message.fields.routingKey,
                },
                serviceName: WORKER_CONTEXT,
            });
            this.safeAck(message);
            return;
        }

        if (!job.taskId || !job.type) {
            this.logger.error({
                context: WORKER_CONTEXT,
                message: 'Invalid task message received; missing fields',
                metadata: {
                    queue,
                    routingKey: message.fields.routingKey,
                },
                serviceName: WORKER_CONTEXT,
            });
            this.safeAck(message);
            return;
        }

        try {
            await this.taskQueueProcessor.process(job);
            this.safeAck(message);
        } catch (error) {
            const normalized = handleError(error);

            this.logger.error({
                context: WORKER_CONTEXT,
                message: 'Failed to process task message',
                error: normalized,
                metadata: {
                    taskId: job.taskId,
                    type: job.type,
                    queue,
                    routingKey: message.fields.routingKey,
                },
                serviceName: WORKER_CONTEXT,
            });

            this.safeNack(message);
        }
    }

    private safeAck(message: ConsumeMessage): void {
        if (!this.channel) {
            return;
        }

        try {
            this.channel.ack(message);
        } catch (error) {
            const normalized = handleError(error);
            this.logger.error({
                context: WORKER_CONTEXT,
                message: 'Failed to acknowledge RabbitMQ message',
                error: normalized,
                metadata: {
                    deliveryTag: message.fields.deliveryTag,
                },
                serviceName: WORKER_CONTEXT,
            });
        }
    }

    private safeNack(message: ConsumeMessage): void {
        if (!this.channel) {
            return;
        }

        try {
            this.channel.nack(message, false, false);
        } catch (error) {
            const normalized = handleError(error);
            this.logger.error({
                context: WORKER_CONTEXT,
                message: 'Failed to nack RabbitMQ message',
                error: normalized,
                metadata: {
                    deliveryTag: message.fields.deliveryTag,
                },
                serviceName: WORKER_CONTEXT,
            });
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
                context: WORKER_CONTEXT,
                message: 'Error while closing RabbitMQ consumer',
                error: normalized,
                metadata: { url: this.config.url },
                serviceName: WORKER_CONTEXT,
            });
        } finally {
            this.channel = null;
            this.connection = null;
            this.connectionPromise = null;
        }
    }
}
