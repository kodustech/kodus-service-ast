import { REPOSITORY_MANAGER_TOKEN } from '@/core/domain/repository/contracts/repository-manager.contract.js';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service.js';
import { S3GraphsService } from '@/core/infrastructure/adapters/services/storage/s3-graphs.service.js';
import { Module } from '@nestjs/common';
import { LogModule } from './log.module.js';

@Module({
    imports: [LogModule],
    providers: [
        {
            provide: REPOSITORY_MANAGER_TOKEN,
            useClass: RepositoryManagerService,
        },
        S3GraphsService,
    ],
    exports: [REPOSITORY_MANAGER_TOKEN],
    controllers: [],
})
export class RepositoryModule {}
