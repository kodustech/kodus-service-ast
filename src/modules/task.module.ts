import { useCases } from '@/core/application/use-cases/task/index.js';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service.js';
import { TaskService } from '@/core/application/services/task/task.service.js';
import { TaskHttpController } from '@/core/infrastructure/http/controllers/task.controller.js';
import { Module } from '@nestjs/common';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';
import { TASK_MANAGER_TOKEN } from '@/core/domain/task/contracts/task-manager.contract.js';
import { QueueModuleApi } from '@/core/infrastructure/queue/queue.module.api.js';

@Module({
    imports: [TaskPersistenceModule, QueueModuleApi],
    providers: [
        ...useCases,
        {
            provide: TASK_MANAGER_TOKEN,
            useClass: TaskManagerService,
        },
        TaskService,
    ],
    exports: [...useCases, TASK_MANAGER_TOKEN, TaskService],
    controllers: [TaskHttpController],
})
export class TaskModule {}
