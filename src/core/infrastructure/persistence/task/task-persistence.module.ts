import { Module } from '@nestjs/common';
import { TaskPersistenceService } from './task-persistence.service';
import { DatabaseModule } from '@/core/infrastructure/database/database.module';

@Module({
    imports: [DatabaseModule],
    providers: [TaskPersistenceService],
    exports: [TaskPersistenceService],
})
export class TaskPersistenceModule {}
