import { useCases } from '@/core/application/use-cases/task/index.js';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service.js';
import { TaskHttpController } from '@/core/infrastructure/http/controllers/task.controller.js';
import { Module } from '@nestjs/common';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';

@Module({
    imports: [TaskPersistenceModule],
    providers: [...useCases, TaskManagerService],
    exports: [...useCases, TaskManagerService],
    controllers: [TaskHttpController],
})
export class TaskModule {}
