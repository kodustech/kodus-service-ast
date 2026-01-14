import { useCases } from '@/core/application/use-cases/lsp/index.js';
import { LSPManager } from '@/core/infrastructure/adapters/services/lsp/lsp-manager.js';
import { LspController } from '@/core/infrastructure/http/controllers/lsp.controller.js';
import { DynamicModule, Module } from '@nestjs/common';
import { RepositoryModule } from './repository.module.js';
import { TaskModule } from './task.module.js';

@Module({})
export class LspModule {
    static forApi(): DynamicModule {
        return {
            module: LspModule,
            imports: [TaskModule, RepositoryModule],
            providers: [...useCases, LSPManager],
            exports: [...useCases],
            controllers: [LspController],
        };
    }

    static forWorker(): DynamicModule {
        return {
            module: LspModule,
            imports: [RepositoryModule],
            providers: [...useCases, LSPManager],
            exports: [...useCases],
            controllers: [],
        };
    }
}
