import { Module } from '@nestjs/common';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';
import { LogModule } from './log.module.js';
import { RepositoryModule } from './repository.module.js';
import { TaskModule } from './task.module.js';
import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';
import { TaskQueueConsumer } from '@/core/infrastructure/queue/task-queue.consumer.js';
import { workerCommands } from '@/core/application/use-cases/ast/index.js';

@Module({
    imports: [
        TaskPersistenceModule,
        LogModule,
        RepositoryModule, // Provides REPOSITORY_MANAGER_TOKEN needed by use cases
        TaskModule, // Provides TASK_MANAGER_TOKEN needed by TaskQueueProcessor
        // ASTModule.forWorker() - provides ParsingModule and other base dependencies
    ],
    providers: [
        ...workerCommands, // Only async commands for worker
        TaskQueueProcessor,
        TaskQueueConsumer,
    ],
    exports: [TaskQueueProcessor, TaskQueueConsumer, ...workerCommands],
})
export class WorkerAstModule {}
