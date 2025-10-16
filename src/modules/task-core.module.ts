import { Module } from '@nestjs/common';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service.js';
import { TASK_MANAGER_TOKEN } from '@/core/domain/task/contracts/task-manager.contract.js';

@Module({
    imports: [TaskPersistenceModule],
    providers: [
        TaskManagerService,
        { provide: TASK_MANAGER_TOKEN, useExisting: TaskManagerService },
    ],
    exports: [TASK_MANAGER_TOKEN, TaskManagerService],
})
export class TaskCoreModule {}
