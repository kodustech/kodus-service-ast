import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL, DATABASE_SCHEMA } from './database.constants.js';
import { getEnvVariable, getEnvVariableAsNumber } from '@/shared/utils/env.js';
import { DatabaseMigrationRunner } from './database.schema-initializer.js';
import { DatabasePoolCleanup } from './database.pool-cleanup.js';
import { sanitizeIdentifier } from './database.utils.js';

function getConfigValue(
    primary: string,
    fallback?: string,
    defaultValue?: string,
): string | undefined {
    const value = getEnvVariable(primary);
    if (value !== undefined) {
        return value;
    }

    if (fallback) {
        return getEnvVariable(fallback, defaultValue);
    }

    return defaultValue;
}

function requireConfig(
    primary: string,
    fallback?: string,
    defaultValue?: string,
): string {
    const value = getConfigValue(primary, fallback, defaultValue);
    if (value === undefined || value === '') {
        const names = fallback ? `${primary} / ${fallback}` : primary;
        throw new Error(`Environment variable ${names} is required`);
    }
    return value;
}

const DEFAULT_SCHEMA = 'kodus_workflow';

@Global()
@Module({
    providers: [
        {
            provide: DATABASE_SCHEMA,
            useFactory: () =>
                sanitizeIdentifier(
                    getConfigValue(
                        'DB_SCHEMA',
                        'API_PG_DB_SCHEMA',
                        DEFAULT_SCHEMA,
                    ) ?? DEFAULT_SCHEMA,
                ),
        },
        {
            provide: DATABASE_POOL,
            inject: [DATABASE_SCHEMA],
            useFactory: () => {
                const url = getEnvVariable('DB_URL');

                const databaseEnv = getConfigValue(
                    'API_DATABASE_ENV',
                    'NODE_ENV',
                    'production',
                )
                    ?.toLowerCase()
                    .trim();

                const isDevelopment =
                    databaseEnv === 'development' || databaseEnv === 'local';

                // Lógica simples: SSL baseado no ambiente
                const useSSL = !isDevelopment; // DEV = false, PROD = true
                const rejectUnauthorized = isDevelopment; // DEV = false, PROD = true

                const poolConfig = url
                    ? {
                          connectionString: url,
                      }
                    : {
                          host: requireConfig(
                              'DB_HOST',
                              'API_PG_DB_HOST',
                              'localhost',
                          ),
                          port: Number(
                              requireConfig(
                                  'DB_PORT',
                                  'API_PG_DB_PORT',
                                  '5432',
                              ),
                          ),
                          user: requireConfig('DB_USER', 'API_PG_DB_USERNAME'),
                          password: requireConfig(
                              'DB_PASSWORD',
                              'API_PG_DB_PASSWORD',
                          ),
                          database: requireConfig(
                              'DB_NAME',
                              'API_PG_DB_DATABASE',
                          ),
                      };

                return new Pool({
                    ...poolConfig,

                    application_name: 'kodus-service-ast',
                    max: getEnvVariableAsNumber('DB_POOL_MAX', 10),
                    idleTimeoutMillis: getEnvVariableAsNumber(
                        'DB_POOL_IDLE_TIMEOUT_MS',
                        30_000,
                    ),
                    connectionTimeoutMillis: getEnvVariableAsNumber(
                        'DB_POOL_CONNECTION_TIMEOUT_MS',
                        5_000,
                    ),

                    statement_timeout: getEnvVariableAsNumber(
                        'DB_STATEMENT_TIMEOUT_MS',
                        0,
                    ),
                    ssl: useSSL
                        ? {
                              rejectUnauthorized: rejectUnauthorized,
                          }
                        : undefined,
                });
            },
        },
        DatabaseMigrationRunner,
        DatabasePoolCleanup,
    ],
    exports: [DATABASE_POOL, DATABASE_SCHEMA],
})
export class DatabaseModule {}
