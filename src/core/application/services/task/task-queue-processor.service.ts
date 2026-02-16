import { InitializeContentFromDiffUseCase } from '@/core/application/use-cases/ast/commands/initialize-content-diff.use-case.js';
import { ValidateCodeUseCase } from '@/core/application/use-cases/ast/commands/validate-code.use-case.js';
import {
    type ITaskManagerService,
    TASK_MANAGER_TOKEN,
    TaskContext,
} from '@/core/domain/task/contracts/task-manager.contract.js';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { TaskContextService } from '@/core/infrastructure/persistence/task/task-context.service.js';
import {
    DEFAULT_CIRCUIT_CONFIG,
    RabbitMQCircuitBreaker,
} from '@/core/infrastructure/queue/rabbitmq-circuit-breaker.js';
import { TaskQueueMessage } from '@/core/infrastructure/queue/task-queue.definition.js';
import {
    InitializeContentFromDiffRequest,
    ValidateCodeRequest,
} from '@/shared/types/ast.js';
import { Inject, Injectable } from '@nestjs/common';

const WORKER_CONTEXT = 'TaskQueueProcessor';

@Injectable()
export class TaskQueueProcessor {
    private circuitBreaker = new RabbitMQCircuitBreaker(DEFAULT_CIRCUIT_CONFIG);

    constructor(
        @Inject(TASK_MANAGER_TOKEN)
        private readonly taskManagerService: ITaskManagerService,
        @Inject(TaskContextService)
        private readonly taskContextService: TaskContextService,
        @Inject(PinoLoggerService)
        private readonly logger: PinoLoggerService,
        @Inject(ValidateCodeUseCase)
        private readonly validateCodeUseCase: ValidateCodeUseCase,
        @Inject(InitializeContentFromDiffUseCase)
        private readonly initializeContentFromDiffUseCase: InitializeContentFromDiffUseCase,
    ) {}

    async process(message: TaskQueueMessage): Promise<void> {
        const taskContext = this.taskContextService.createContext(
            message.taskId,
        );

        try {
            await this.circuitBreaker.execute(async () => {
                switch (message.type) {
                    case 'AST_VALIDATE_CODE':
                        await this.processValidateCode(
                            message.payload as ValidateCodeRequest,
                            taskContext,
                        );
                        return;
                    case 'AST_INITIALIZE_DIFF_ANALYSIS':
                        await this.processInitializeContentFromDiff(
                            message.payload as InitializeContentFromDiffRequest,
                            taskContext,
                        );
                        return;
                    default:
                        await this.markUnsupported(message);
                        const error = new Error(
                            `Unsupported task type: ${message.type}`,
                        );
                        (error as any).errorType = 'BUSINESS_ERROR';
                        throw error;
                }
            });
        } catch (error) {
            this.logger.error({
                message: 'Task failed with circuit breaker protection',
                context: WORKER_CONTEXT,
                error,
                metadata: {
                    taskId: message.taskId,
                    type: message.type,
                    circuitBreaker: this.circuitBreaker.getStatus(),
                },
                serviceName: WORKER_CONTEXT,
            });
            throw error;
        }
    }

    private async processValidateCode(
        request: ValidateCodeRequest,
        taskContext: TaskContext,
    ): Promise<void> {
        const { files } = request;

        try {
            const result = await this.validateCodeUseCase.execute({
                files,
            });

            if (taskContext) {
                await taskContext.complete(
                    'Code validation completed successfully',
                    result,
                );
            }
        } catch (error) {
            this.logger.error({
                message: 'Error during code validation',
                context: WORKER_CONTEXT,
                error,
                metadata: {
                    taskId: taskContext?.taskId,
                },
                serviceName: WORKER_CONTEXT,
            });

            if (taskContext) {
                await taskContext.fail(
                    error instanceof Error ? error.message : 'Unknown error',
                    'Code validation failed',
                );
            }
            throw error;
        }
    }

    private async processInitializeContentFromDiff(
        request: InitializeContentFromDiffRequest,
        taskContext: TaskContext,
    ): Promise<void> {
        try {
            await this.initializeContentFromDiffUseCase.execute(
                taskContext,
                request,
            );
        } catch (error) {
            this.logger.error({
                message: 'Error during content from diff initialization',
                context: WORKER_CONTEXT,
                error,
                metadata: {
                    taskId: taskContext?.taskId,
                },
                serviceName: WORKER_CONTEXT,
            });

            if (taskContext) {
                await taskContext.fail(
                    error instanceof Error ? error.message : 'Unknown error',
                    'Content from diff initialization failed',
                );
            }

            throw error;
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
