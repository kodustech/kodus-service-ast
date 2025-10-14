import { Module } from '@nestjs/common';
import { TaskPersistenceService } from './task-persistence.service.js';
import { DatabaseModule } from '@/core/infrastructure/database/database.module.js';

@Module({
    imports: [DatabaseModule],
    providers: [TaskPersistenceService],
    exports: [TaskPersistenceService],
})
export class TaskPersistenceModule {}
