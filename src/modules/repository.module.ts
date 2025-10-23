import { REPOSITORY_MANAGER_TOKEN } from '@/core/domain/repository/contracts/repository-manager.contract.js';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service.js';
import { S3GraphsService } from '@/core/infrastructure/adapters/services/storage/s3-graphs.service.js';
import { TaskResultStorageService } from '@/core/infrastructure/adapters/services/storage/task-result-storage.service.js';
import { Module } from '@nestjs/common';
import { LogModule } from './log.module.js';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';

@Module({
    imports: [LogModule, TaskPersistenceModule],
    providers: [
        {
            provide: REPOSITORY_MANAGER_TOKEN,
            useClass: RepositoryManagerService,
        },
        S3GraphsService,
        TaskResultStorageService,
    ],
    exports: [REPOSITORY_MANAGER_TOKEN],
    controllers: [],
})
export class RepositoryModule {}
