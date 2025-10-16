import { Module } from '@nestjs/common';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';
import { RepositoryModule } from './repository.module.js';
import { ParsingModule } from './parsing.module.js';
import { EnrichmentModule } from './enrichment.module.js';
import { GraphAnalysisModule } from './graph-analysis.module.js';
import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';
import { TaskQueueConsumer } from '@/core/infrastructure/queue/task-queue.consumer.js';
import { TASK_MANAGER_TOKEN } from '@/core/domain/task/contracts/task-manager.contract.js';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service.js';

@Module({
    imports: [
        TaskPersistenceModule,
        RepositoryModule,
        ParsingModule,
        EnrichmentModule,
        GraphAnalysisModule,
    ],
    providers: [
        { provide: TASK_MANAGER_TOKEN, useClass: TaskManagerService },
        TaskQueueProcessor,
        TaskQueueConsumer,
    ],
    exports: [TaskQueueProcessor, TaskQueueConsumer],
})
export class WorkerAstModule {}
