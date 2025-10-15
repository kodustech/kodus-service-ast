import { Module } from '@nestjs/common';
import { QueueModuleWorker } from '@/core/infrastructure/queue/queue.module.worker.js';
import { TaskQueueConsumer } from '@/core/infrastructure/queue/task-queue.consumer.js';
import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';
import { RepositoryModule } from './repository.module.js';
import { ParsingModule } from './parsing.module.js';
import { EnrichmentModule } from './enrichment.module.js';
import { GraphAnalysisModule } from './graph-analysis.module.js';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service.js';
import { TASK_MANAGER_TOKEN } from '@/core/domain/task/contracts/task-manager.contract.js';
import { useCases } from '@/core/application/use-cases/ast/index.js';

@Module({
    imports: [
        QueueModuleWorker,
        TaskPersistenceModule,
        RepositoryModule,
        ParsingModule,
        EnrichmentModule,
        GraphAnalysisModule,
    ],
    providers: [
        TaskManagerService,
        { provide: TASK_MANAGER_TOKEN, useExisting: TaskManagerService },
        ...useCases,
        TaskQueueProcessor,
        TaskQueueConsumer,
    ],
})
export class WorkerModule {}
