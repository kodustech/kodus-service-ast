import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service';
import { Module } from '@nestjs/common';

@Module({
    imports: [],
    providers: [TaskManagerService],
    exports: [TaskManagerService],
    controllers: [],
})
export class TaskModule {}
