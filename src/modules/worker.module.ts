import { Module } from '@nestjs/common';
import { LogModule } from './log.module.js';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';
import { RepositoryModule } from './repository.module.js';
import { ParsingModule } from './parsing.module.js';
import { EnrichmentModule } from './enrichment.module.js';
import { GraphAnalysisModule } from './graph-analysis.module.js';
import { useCases } from '@/core/application/use-cases/ast/index.js';
import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';
import { RabbitTaskConsumer } from '@/core/infrastructure/queue/rabbit-task-consumer.service.js';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service.js';
import { TASK_MANAGER_TOKEN } from '@/core/domain/task/contracts/task-manager.contract.js';
import { getEnvVariable } from '@/shared/utils/env.js';
import { loadRabbitMqConfig } from '@/core/infrastructure/queue/rabbit.config.js';
import { RABBITMQ_CONFIG } from '@/core/infrastructure/queue/rabbit.constants.js';

const DEFAULT_SERVICE_NAME = 'kodus-service-ast-worker';

@Module({
    imports: [
        LogModule,
        TaskPersistenceModule,
        RepositoryModule,
        ParsingModule,
        EnrichmentModule,
        GraphAnalysisModule,
    ],
    providers: [
        {
            provide: RABBITMQ_CONFIG,
            useFactory: () => {
                const serviceName =
                    getEnvVariable('SERVICE_NAME') ??
                    getEnvVariable('CONTAINER_NAME') ??
                    DEFAULT_SERVICE_NAME;

                return loadRabbitMqConfig(serviceName);
            },
        },
        TaskManagerService,
        {
            provide: TASK_MANAGER_TOKEN,
            useExisting: TaskManagerService,
        },
        ...useCases,
        TaskQueueProcessor,
        RabbitTaskConsumer,
    ],
})
export class WorkerModule {}
