import { getEnvVariable, getEnvVariableAsNumber } from '@/shared/utils/env.js';

export interface RabbitMqConfig {
    enabled: boolean;
    url: string;
    retryQueue?: string;
    retryTtlMs?: number;
    prefetch: number;
    publishTimeoutMs: number;
    connectionName: string;
}

export function loadRabbitMqConfig(): RabbitMqConfig {
    const url = getEnvVariable('RABBIT_URL');
    const rabbitmqEnabled =
        getEnvVariable('API_RABBITMQ_ENABLED', 'true')?.toLowerCase() ===
        'true';

    if (!url || !rabbitmqEnabled) {
        return {
            enabled: false,
            url: '',
            retryQueue: getEnvVariable('RABBIT_RETRY_QUEUE'),
            retryTtlMs: getEnvVariableAsNumber('RABBIT_RETRY_TTL_MS', 60000),
            prefetch: getEnvVariableAsNumber('RABBIT_PREFETCH', 2) ?? 2,
            publishTimeoutMs:
                getEnvVariableAsNumber('RABBIT_PUBLISH_TIMEOUT_MS', 5000) ??
                5000,
            connectionName: 'kodus-service-ast-api',
        };
    }

    return {
        enabled: true,
        url,
        retryQueue: getEnvVariable('RABBIT_RETRY_QUEUE'),
        retryTtlMs: getEnvVariableAsNumber('RABBIT_RETRY_TTL_MS', 60000),
        prefetch: getEnvVariableAsNumber('RABBIT_PREFETCH', 2) ?? 2,
        publishTimeoutMs:
            getEnvVariableAsNumber('RABBIT_PUBLISH_TIMEOUT_MS', 5000) ?? 5000,
        connectionName: 'kodus-service-ast-api',
    };
}
