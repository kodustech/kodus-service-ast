import { getEnvVariable, getEnvVariableAsNumber } from '@/shared/utils/env.js';

export interface RabbitMqConfig {
    enabled: boolean;
    url: string;
    exchange: string;
    deadLetterExchange: string;
    deadLetterQueue: string;
    retryQueue?: string;
    retryTtlMs?: number;
    prefetch: number;
    publishTimeoutMs: number;
    connectionName: string;
}

const DEFAULT_EXCHANGE = 'ast.jobs.x';
const DEFAULT_DLX = 'ast.jobs.dlx';
const DEFAULT_DLQ = 'ast.jobs.dlq';
const DEFAULT_RETRY_QUEUE = 'ast.jobs.retry.q';

export function loadRabbitMqConfig(serviceName: string): RabbitMqConfig {
    const url = getEnvVariable('RABBIT_URL');

    if (!url) {
        return {
            enabled: false,
            url: '',
            exchange: DEFAULT_EXCHANGE,
            deadLetterExchange: DEFAULT_DLX,
            deadLetterQueue: DEFAULT_DLQ,
            retryQueue: DEFAULT_RETRY_QUEUE,
            retryTtlMs: getEnvVariableAsNumber('RABBIT_RETRY_TTL_MS', 30000),
            prefetch: getEnvVariableAsNumber('RABBIT_PREFETCH', 1) ?? 1,
            publishTimeoutMs:
                getEnvVariableAsNumber('RABBIT_PUBLISH_TIMEOUT_MS', 5000) ??
                5000,
            connectionName: serviceName,
        };
    }

    return {
        enabled: true,
        url,
        exchange: getEnvVariable('RABBIT_EXCHANGE', DEFAULT_EXCHANGE)!,
        deadLetterExchange: getEnvVariable('RABBIT_DLX', DEFAULT_DLX)!,
        deadLetterQueue: getEnvVariable('RABBIT_DLQ', DEFAULT_DLQ)!,
        retryQueue: getEnvVariable('RABBIT_RETRY_QUEUE', DEFAULT_RETRY_QUEUE)!,
        retryTtlMs: getEnvVariableAsNumber('RABBIT_RETRY_TTL_MS', 30000),
        prefetch: getEnvVariableAsNumber('RABBIT_PREFETCH', 1) ?? 1,
        publishTimeoutMs:
            getEnvVariableAsNumber('RABBIT_PUBLISH_TIMEOUT_MS', 5000) ?? 5000,
        connectionName: serviceName,
    };
}
