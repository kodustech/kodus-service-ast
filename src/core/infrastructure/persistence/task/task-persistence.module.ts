import { Module } from '@nestjs/common';
import { TaskPersistenceService } from './task-persistence.service.js';
import { TaskContextService } from './task-context.service.js';
import { DatabaseModule } from '@/core/infrastructure/database/database.module.js';

@Module({
    imports: [DatabaseModule],
    providers: [TaskPersistenceService, TaskContextService],
    exports: [TaskPersistenceService, TaskContextService],
})
export class TaskPersistenceModule {}
