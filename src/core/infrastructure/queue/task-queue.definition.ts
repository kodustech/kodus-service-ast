import type { Channel } from 'amqplib';
import type { RabbitMqConfig } from './rabbit.config.js';

export interface QueueBinding {
    type: string;
    queue: string;
    routingKey: string;
}

export interface TaskQueueMessage<TPayload = unknown> {
    taskId: string;
    type: string;
    payload: TPayload;
    metadata?: Record<string, unknown>;
    priority?: number;
    retryCount?: number;
    createdAt: string;
}

export const DELIVERY_LIMIT = 5;

export const TASK_QUEUE_BINDINGS: ReadonlyArray<QueueBinding> = [
    {
        type: 'AST_INITIALIZE_REPOSITORY',
        queue: 'ast.initialize.repo.q',
        routingKey: 'ast.initialize.repo',
    },
    {
        type: 'AST_INITIALIZE_IMPACT_ANALYSIS',
        queue: 'ast.initialize.impact.q',
        routingKey: 'ast.initialize.impact',
    },
];

const ROUTING_BY_TYPE = new Map(
    TASK_QUEUE_BINDINGS.map((binding) => [binding.type, binding.routingKey]),
);

export function resolveRoutingKey(type: string): {
    routingKey: string;
    isFallback: boolean;
} {
    const routingKey = ROUTING_BY_TYPE.get(type);

    if (!routingKey) {
        const fallback = `ast.custom.${type.toLowerCase()}`;
        return { routingKey: fallback, isFallback: true };
    }

    return { routingKey, isFallback: false };
}

export async function ensureTaskQueueTopology(
    channel: Channel,
    config: RabbitMqConfig,
): Promise<void> {
    await channel.assertExchange(config.exchange, 'topic', {
        durable: true,
    });

    await channel.assertExchange(config.deadLetterExchange, 'topic', {
        durable: true,
    });

    await channel.assertQueue(config.deadLetterQueue, {
        durable: true,
        arguments: {
            'x-queue-type': 'quorum',
        },
    });

    await channel.bindQueue(
        config.deadLetterQueue,
        config.deadLetterExchange,
        '#',
    );

    for (const binding of TASK_QUEUE_BINDINGS) {
        await channel.assertQueue(binding.queue, {
            durable: true,
            arguments: {
                'x-queue-type': 'quorum',
                'x-dead-letter-exchange': config.deadLetterExchange,
                'x-delivery-limit': DELIVERY_LIMIT,
            },
        });

        await channel.bindQueue(
            binding.queue,
            config.exchange,
            binding.routingKey,
        );
    }

    if (config.retryQueue) {
        await channel.assertQueue(config.retryQueue, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': config.exchange,
                ...(config.retryTtlMs
                    ? { 'x-message-ttl': config.retryTtlMs }
                    : {}),
            },
        });
    }
}
