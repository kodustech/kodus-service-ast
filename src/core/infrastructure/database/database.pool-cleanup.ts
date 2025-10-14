import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from './database.constants';

@Injectable()
export class DatabasePoolCleanup implements OnModuleDestroy {
    constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

    async onModuleDestroy(): Promise<void> {
        await this.pool.end().catch(() => undefined);
    }
}
