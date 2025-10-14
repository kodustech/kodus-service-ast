import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL, DATABASE_SCHEMA } from './database.constants';
import {
    CREATE_MIGRATIONS_TABLE,
    DATABASE_MIGRATIONS,
    MIGRATIONS_TABLE,
} from './database.migrations';
import { quoteIdentifier } from './database.utils';

@Injectable()
export class DatabaseMigrationRunner implements OnModuleInit {
    constructor(
        @Inject(DATABASE_POOL) private readonly pool: Pool,
        @Inject(DATABASE_SCHEMA) private readonly schema: string,
    ) {}

    async onModuleInit(): Promise<void> {
        await this.runMigrations();
    }

    private async runMigrations(): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(
                `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(this.schema)}`,
            );

            const migrationsTable = MIGRATIONS_TABLE(this.schema);
            await client.query(CREATE_MIGRATIONS_TABLE(this.schema));

            for (const migration of DATABASE_MIGRATIONS) {
                const executed = await client.query(
                    `SELECT 1 FROM ${migrationsTable} WHERE id = $1`,
                    [migration.id],
                );

                if (executed.rowCount > 0) {
                    continue;
                }

                await migration.up(client, this.schema);

                await client.query(
                    `INSERT INTO ${migrationsTable} (id, description) VALUES ($1, $2)`,
                    [migration.id, migration.description],
                );
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
