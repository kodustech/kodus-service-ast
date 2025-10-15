import { getEnvVariable } from '@/shared/utils/env.js';

// Queue configuration constants and types
export const QUEUE_CONFIG = {
    // Delivery limits
    DELIVERY_LIMIT: 5,

    // Queue types
    QUEUE_TYPE: 'quorum',

    // Exchanges
    EXCHANGE: 'ast.jobs.x',
    DEAD_LETTER_EXCHANGE: 'ast.jobs.dlx',

    // Queues
    REPO_QUEUE: 'ast.initialize.repo.q',
    IMPACT_QUEUE: 'ast.initialize.impact.q',
    DEAD_LETTER_QUEUE: 'ast.jobs.dlq',
    ECHO_QUEUE: 'ast.test.echo.q',

    // Routing keys
    REPO_ROUTING_KEY: 'ast.initialize.repo',
    IMPACT_ROUTING_KEY: 'ast.initialize.impact',
    ECHO_ROUTING_KEY: 'ast.test.echo',
} as const;

// Runtime configuration
export function getQueueRuntimeConfig() {
    return {
        enableSingleActiveConsumer:
            (getEnvVariable('RABBIT_SAC') ?? 'false') === 'true',
        retryTtlMs: Number(getEnvVariable('RABBIT_RETRY_TTL_MS') ?? '30000'),
        prefetch: Number(getEnvVariable('RABBIT_PREFETCH') ?? '1'),
        publishTimeoutMs: Number(
            getEnvVariable('RABBIT_PUBLISH_TIMEOUT_MS') ?? '5000',
        ),
    };
}

// Queue arguments builder
export function buildQueueArguments(
    options: {
        deadLetterExchange?: string;
        deliveryLimit?: number;
        singleActiveConsumer?: boolean;
        messageTtl?: number;
    } = {},
) {
    const args: Record<string, any> = {
        'x-queue-type': QUEUE_CONFIG.QUEUE_TYPE,
    };

    if (options.deadLetterExchange) {
        args['x-dead-letter-exchange'] = options.deadLetterExchange;
    }

    if (options.deliveryLimit) {
        args['x-delivery-limit'] = options.deliveryLimit;
    }

    if (options.singleActiveConsumer) {
        args['x-single-active-consumer'] = true;
    }

    if (options.messageTtl) {
        args['x-message-ttl'] = options.messageTtl;
    }

    return args;
}

// Consumer queue options builder
export function buildConsumerQueueOptions(
    options: {
        deadLetterExchange?: string;
        deliveryLimit?: number;
        singleActiveConsumer?: boolean;
    } = {},
) {
    return {
        channel: 'consumer' as const,
        durable: true,
        arguments: buildQueueArguments(options),
    };
}

// Build task queue options with runtime config
export function buildTaskQueueOptions(config: {
    enableSingleActiveConsumer: boolean;
}) {
    return buildConsumerQueueOptions({
        deadLetterExchange: QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
        deliveryLimit: QUEUE_CONFIG.DELIVERY_LIMIT,
        singleActiveConsumer: config.enableSingleActiveConsumer,
    });
}
