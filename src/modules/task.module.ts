import { Module } from '@nestjs/common';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';
import { QueueModuleApi } from '@/core/infrastructure/queue/queue.module.api.js';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service.js';
import { TASK_MANAGER_TOKEN } from '@/core/domain/task/contracts/task-manager.contract.js';
import { TaskService } from '@/core/application/services/task/task.service.js';
import { useCases } from '@/core/application/use-cases/task/index.js';
import { TaskHttpController } from '@/core/infrastructure/http/controllers/task.controller.js';
import { TaskResultStorageService } from '@/core/infrastructure/adapters/services/storage/task-result-storage.service.js';

@Module({
    imports: [TaskPersistenceModule, QueueModuleApi],
    providers: [
        ...useCases,
        TaskManagerService,
        { provide: TASK_MANAGER_TOKEN, useExisting: TaskManagerService },
        TaskService,
        TaskResultStorageService,
    ],
    exports: [...useCases, TaskService, TaskResultStorageService],
    controllers: [TaskHttpController],
})
export class TaskModule {}
