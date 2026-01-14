import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';
import { ValidateCodeUseCase } from '@/core/application/use-cases/ast/index.js';
import { GetGraphsUseCase } from '@/core/application/use-cases/ast/queries/get-graphs.use-case.js';
import { TASK_MANAGER_TOKEN } from '@/core/domain/task/contracts/task-manager.contract.js';
import { TaskResultStorageService } from '@/core/infrastructure/adapters/services/storage/task-result-storage.service.js';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service.js';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';
import { TaskQueueConsumer } from '@/core/infrastructure/queue/task-queue.consumer.js';
import { Module } from '@nestjs/common';
import { EnrichmentModule } from './enrichment.module.js';
import { GraphAnalysisModule } from './graph-analysis.module.js';
import { LspModule } from './lsp.module.js';
import { ParsingModule } from './parsing.module.js';
import { RepositoryModule } from './repository.module.js';

@Module({
    imports: [
        TaskPersistenceModule,
        RepositoryModule,
        ParsingModule,
        EnrichmentModule,
        GraphAnalysisModule,
        LspModule.forWorker(),
    ],
    providers: [
        { provide: TASK_MANAGER_TOKEN, useClass: TaskManagerService },
        TaskQueueProcessor,
        TaskQueueConsumer,
        TaskResultStorageService,
        GetGraphsUseCase,
        ValidateCodeUseCase,
    ],
    exports: [TaskQueueProcessor, TaskQueueConsumer],
})
export class WorkerAstModule {}
