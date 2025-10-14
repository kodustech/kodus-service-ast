import { UseCases } from '@/core/application/use-cases/task';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service';
import { TaskController } from '@/core/infrastructure/grpc/controllers/task/task.controller';
import { Module } from '@nestjs/common';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module';

@Module({
    imports: [TaskPersistenceModule],
    providers: [...UseCases, TaskManagerService],
    exports: [...UseCases, TaskManagerService],
    controllers: [TaskController],
})
export class TaskModule {}
