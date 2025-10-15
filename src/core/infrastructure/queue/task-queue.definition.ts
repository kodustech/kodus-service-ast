import type { Channel } from 'amqplib';
import type { RabbitMqConfig } from './rabbit.config.js';
import { QUEUE_CONFIG } from './queue.constants.js';

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

export const TASK_QUEUE_BINDINGS: ReadonlyArray<QueueBinding> = [
    {
        type: 'AST_INITIALIZE_REPOSITORY',
        queue: QUEUE_CONFIG.REPO_QUEUE,
        routingKey: QUEUE_CONFIG.REPO_ROUTING_KEY,
    },
    {
        type: 'AST_INITIALIZE_IMPACT_ANALYSIS',
        queue: QUEUE_CONFIG.IMPACT_QUEUE,
        routingKey: QUEUE_CONFIG.IMPACT_ROUTING_KEY,
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
    await channel.assertExchange(QUEUE_CONFIG.EXCHANGE, 'topic', {
        durable: true,
    });

    await channel.assertExchange(QUEUE_CONFIG.DEAD_LETTER_EXCHANGE, 'topic', {
        durable: true,
    });

    await channel.assertQueue(QUEUE_CONFIG.DEAD_LETTER_QUEUE, {
        durable: true,
        arguments: {
            'x-queue-type': QUEUE_CONFIG.QUEUE_TYPE,
        },
    });

    await channel.bindQueue(
        QUEUE_CONFIG.DEAD_LETTER_QUEUE,
        QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
        '#',
    );

    for (const binding of TASK_QUEUE_BINDINGS) {
        await channel.assertQueue(binding.queue, {
            durable: true,
            arguments: {
                'x-queue-type': QUEUE_CONFIG.QUEUE_TYPE,
                'x-dead-letter-exchange': QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
                'x-delivery-limit': QUEUE_CONFIG.DELIVERY_LIMIT,
            },
        });

        await channel.bindQueue(
            binding.queue,
            QUEUE_CONFIG.EXCHANGE,
            binding.routingKey,
        );
    }

    if (config.retryQueue) {
        await channel.assertQueue(config.retryQueue, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': QUEUE_CONFIG.EXCHANGE,
                ...(config.retryTtlMs
                    ? { 'x-message-ttl': config.retryTtlMs }
                    : {}),
            },
        });
    }
}
