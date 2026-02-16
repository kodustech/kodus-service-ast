import {
    InitializeContentFromDiffUseCase,
    ValidateCodeUseCase,
} from '@/core/application/use-cases/ast/index.js';
import { TASK_MANAGER_TOKEN } from '@/core/domain/task/contracts/task-manager.contract.js';
import { TaskResultStorageService } from '@/core/infrastructure/adapters/services/storage/task-result-storage.service.js';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service.js';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';
import { TaskQueueConsumer } from '@/core/infrastructure/queue/task-queue.consumer.js';
import { Module } from '@nestjs/common';
import { TaskQueueProcessor } from '../core/application/services/task/task-queue-processor.service.js';
import { DiffModule } from './diff.module.js';
import { EnrichmentModule } from './enrichment.module.js';
import { ParsingModule } from './parsing.module.js';

@Module({
    imports: [
        TaskPersistenceModule,
        DiffModule,
        ParsingModule,
        EnrichmentModule,
    ],
    providers: [
        { provide: TASK_MANAGER_TOKEN, useClass: TaskManagerService },
        TaskQueueProcessor,
        TaskQueueConsumer,
        TaskResultStorageService,
        InitializeContentFromDiffUseCase,
        ValidateCodeUseCase,
    ],
    exports: [TaskQueueProcessor, TaskQueueConsumer],
})
export class WorkerAstModule {}
