import { REPOSITORY_MANAGER_TOKEN } from '@/core/domain/repository/contracts/repository-manager.contract.js';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service.js';
import { Module } from '@nestjs/common';

@Module({
    imports: [],
    providers: [
        {
            provide: REPOSITORY_MANAGER_TOKEN,
            useClass: RepositoryManagerService,
        },
    ],
    exports: [REPOSITORY_MANAGER_TOKEN],
    controllers: [],
})
export class RepositoryModule {}
