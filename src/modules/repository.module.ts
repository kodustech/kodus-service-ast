import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service';
import { Module } from '@nestjs/common';

@Module({
    imports: [],
    providers: [RepositoryManagerService],
    exports: [RepositoryManagerService],
    controllers: [],
})
export class RepositoryModule {}
