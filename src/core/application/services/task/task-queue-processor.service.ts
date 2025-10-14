import { Inject, Injectable } from '@nestjs/common';
import { InitializeRepositoryUseCase } from '@/core/application/use-cases/ast/graphs/initialize-repository.use-case.js';
import { InitializeImpactAnalysisUseCase } from '@/core/application/use-cases/ast/analysis/initialize-impact-analysis.use-case.js';
import {
    InitializeRepositoryRequest,
    InitializeImpactAnalysisRequest,
} from '@/shared/types/ast.js';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import {
    type ITaskManagerService,
    TASK_MANAGER_TOKEN,
} from '@/core/domain/task/contracts/task-manager.contract.js';
import { TaskQueueMessage } from '@/core/infrastructure/queue/task-queue.definition.js';

const WORKER_CONTEXT = 'TaskQueueProcessor';

@Injectable()
export class TaskQueueProcessor {
    constructor(
        private readonly initializeRepositoryUseCase: InitializeRepositoryUseCase,
        private readonly initializeImpactAnalysisUseCase: InitializeImpactAnalysisUseCase,
        @Inject(TASK_MANAGER_TOKEN)
        private readonly taskManagerService: ITaskManagerService,
        private readonly logger: PinoLoggerService,
    ) {}

    async process(message: TaskQueueMessage): Promise<void> {
        switch (message.type) {
            case 'AST_INITIALIZE_REPOSITORY':
                await this.initializeRepositoryUseCase.execute(
                    message.payload as InitializeRepositoryRequest,
                    message.taskId,
                );
                return;
            case 'AST_INITIALIZE_IMPACT_ANALYSIS':
                await this.initializeImpactAnalysisUseCase.execute(
                    message.payload as InitializeImpactAnalysisRequest,
                    message.taskId,
                );
                return;
            default:
                await this.markUnsupported(message);
                throw new Error(`Unsupported task type: ${message.type}`);
        }
    }

    private async markUnsupported(message: TaskQueueMessage): Promise<void> {
        this.logger.error({
            context: WORKER_CONTEXT,
            message: 'Unsupported task type received',
            metadata: {
                taskId: message.taskId,
                type: message.type,
            },
            serviceName: WORKER_CONTEXT,
        });

        await this.taskManagerService.failTask(
            message.taskId,
            `Unsupported task type: ${message.type}`,
            'Unsupported task type',
        );
    }
}
