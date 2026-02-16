import { AstHttpController } from '@/core/infrastructure/http/controllers/ast.controller.js';
import { DynamicModule, Module } from '@nestjs/common';
import { TaskModule } from './task.module.js';

@Module({})
export class ASTModule {
    static forApi(): DynamicModule {
        return {
            module: ASTModule,
            imports: [TaskModule],
            providers: [],
            exports: [],
            controllers: [AstHttpController],
        };
    }
}
