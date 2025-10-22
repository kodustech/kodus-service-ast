import { Inject, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import {
    type ITaskManagerService,
    TASK_MANAGER_TOKEN,
} from '@/core/domain/task/contracts/task-manager.contract.js';
import { TaskQueueMessage } from '@/core/infrastructure/queue/task-queue.definition.js';
import { TaskContextService } from '@/core/infrastructure/persistence/task/task-context.service.js';
import {
    RabbitMQCircuitBreaker,
    DEFAULT_CIRCUIT_CONFIG,
} from '@/core/infrastructure/queue/rabbitmq-circuit-breaker.js';
import {
    type IRepositoryManager,
    REPOSITORY_MANAGER_TOKEN,
} from '@/core/domain/repository/contracts/repository-manager.contract.js';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/parsing/code-knowledge-graph.service.js';
import { GraphEnrichmentService } from '@/core/infrastructure/adapters/services/enrichment/graph-enrichment.service.js';
import { TaskResultStorageService } from '@/core/infrastructure/adapters/services/storage/task-result-storage.service.js';
import {
    InitializeRepositoryRequest,
    InitializeImpactAnalysisRequest,
} from '@/shared/types/ast.js';
import { astSerializer } from '@/shared/utils/ast-serialization.js';
import { getEnvVariableAsBoolean } from '@/shared/utils/env.js';
import { handleError } from '@/shared/utils/errors.js';
import * as path from 'path';

const WORKER_CONTEXT = 'TaskQueueProcessor';

@Injectable()
export class TaskQueueProcessor {
    private circuitBreaker = new RabbitMQCircuitBreaker(DEFAULT_CIRCUIT_CONFIG);

    constructor(
        @Inject(TASK_MANAGER_TOKEN)
        private readonly taskManagerService: ITaskManagerService,
        @Inject(REPOSITORY_MANAGER_TOKEN)
        private readonly repositoryManagerService: IRepositoryManager,
        @Inject(CodeKnowledgeGraphService)
        private readonly codeKnowledgeGraphService: CodeKnowledgeGraphService,
        @Inject(GraphEnrichmentService)
        private readonly graphEnrichmentService: GraphEnrichmentService,
        @Inject(TaskResultStorageService)
        private readonly taskResultStorageService: TaskResultStorageService,
        @Inject(TaskContextService)
        private readonly taskContextService: TaskContextService,
        @Inject(PinoLoggerService)
        private readonly logger: PinoLoggerService,
    ) {}

    async process(message: TaskQueueMessage): Promise<void> {
        // Check circuit breaker before processing
        if (!this.circuitBreaker.isAvailable()) {
            this.logger.warn({
                message: 'Circuit breaker preventing task processing',
                context: WORKER_CONTEXT,
                metadata: { taskId: message.taskId },
                serviceName: WORKER_CONTEXT,
            });
            throw new Error('RabbitMQ circuit breaker is open');
        }

        const taskContext = this.taskContextService.createContext(
            message.taskId,
        );

        try {
            // Execute task with circuit breaker protection
            await this.circuitBreaker.execute(async () => {
                switch (message.type) {
                    case 'AST_INITIALIZE_REPOSITORY':
                        await this.processInitializeRepository(
                            message.payload as InitializeRepositoryRequest,
                            taskContext,
                        );
                        return;
                    case 'AST_INITIALIZE_IMPACT_ANALYSIS':
                        await this.processInitializeImpactAnalysis(
                            message.payload as InitializeImpactAnalysisRequest,
                            taskContext,
                        );
                        return;
                    default:
                        await this.markUnsupported(message);
                        throw new Error(
                            `Unsupported task type: ${message.type}`,
                        );
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

    private async processInitializeRepository(
        request: InitializeRepositoryRequest,
        taskContext: any,
    ): Promise<void> {
        const { baseRepo, headRepo, filePaths = [] } = request;
        const taskId = request?.taskId ?? taskContext?.taskId;

        if (!baseRepo || !headRepo) {
            throw new Error('Both baseRepo and headRepo must be provided');
        }

        try {
            if (taskContext) {
                await taskContext.start('Cloning base repository');
            }
            const baseDirPath = await this.cloneRepo(baseRepo);

            if (taskContext) {
                await taskContext.update('Cloning head repository');
            }
            const headDirPath = await this.cloneRepo(headRepo);

            if (taskContext) {
                await taskContext.update('Building head graph');
            }
            const headGraph =
                await this.codeKnowledgeGraphService.buildGraphStreaming(
                    headDirPath,
                    filePaths,
                );

            if (taskContext) {
                await taskContext.update('Building base graph');
            }
            const baseGraph =
                await this.codeKnowledgeGraphService.buildGraphStreaming(
                    baseDirPath,
                    filePaths,
                );

            if (taskContext) {
                await taskContext.update('Building enriched head graph');
            }
            const enrichedHeadGraph =
                this.graphEnrichmentService.enrichGraph(headGraph);

            if (taskContext) {
                await taskContext.update('Storing graphs');
            }
            await this.storeGraphs(
                headRepo,
                baseGraph,
                baseDirPath,
                headGraph,
                headDirPath,
                enrichedHeadGraph,
                taskId,
            );

            if (taskContext) {
                await taskContext.complete(
                    'Repository initialized successfully',
                );
            }
        } catch (error) {
            this.logger.error({
                message: 'Failed to initialize repository',
                context: WORKER_CONTEXT,
                error,
                metadata: { request },
                serviceName: WORKER_CONTEXT,
            });

            if (taskContext) {
                await taskContext.fail(
                    handleError(error).message,
                    'Initialization failed',
                );
            }
            throw error;
        }
    }

    private async processInitializeImpactAnalysis(
        request: InitializeImpactAnalysisRequest,
        taskContext: any,
    ): Promise<void> {
        // TODO: Implement impact analysis processing logic
        // This should call the appropriate services for impact analysis
        if (taskContext) {
            await taskContext.start('Initializing impact analysis');
        }

        // Placeholder implementation
        this.logger.log({
            message: 'Processing impact analysis',
            context: WORKER_CONTEXT,
            metadata: { request },
            serviceName: WORKER_CONTEXT,
        });

        if (taskContext) {
            await taskContext.complete(
                'Impact analysis initialized successfully',
            );
        }
    }

    private async cloneRepo(repoData: any): Promise<string> {
        const repoDir = await this.repositoryManagerService.gitCloneWithAuth({
            repoData,
        });

        if (!repoDir || repoDir.trim() === '') {
            this.logger.error({
                message: 'Failed to clone repository',
                context: WORKER_CONTEXT,
                metadata: { request: JSON.stringify(repoData) },
                serviceName: WORKER_CONTEXT,
            });
            throw new Error('Failed to clone repository');
        }

        this.logger.log({
            message: `Cloned repository to ${repoDir}`,
            context: WORKER_CONTEXT,
            metadata: { request: JSON.stringify(repoData) },
            serviceName: WORKER_CONTEXT,
        });

        return path.resolve(repoDir);
    }

    private async storeGraphs(
        repoData: any,
        baseGraph: any,
        baseGraphDir: string,
        headGraph: any,
        headGraphDir: string,
        enrichHeadGraph: any,
        taskId: string,
    ): Promise<void> {
        const fileName = this.repositoryManagerService.graphsFileName;
        const graphs = astSerializer.serializeGetGraphsResponseData({
            baseGraph: {
                graph: baseGraph,
                dir: baseGraphDir,
            },
            headGraph: {
                graph: headGraph,
                dir: headGraphDir,
            },
            enrichHeadGraph,
        });

        const graphsJson = JSON.stringify(graphs, null, 2);
        const graphsSize = Buffer.byteLength(graphsJson, 'utf8');

        const ok = await this.repositoryManagerService.writeFile({
            repoData,
            filePath: fileName,
            data: graphsJson,
            inKodusDir: true,
            taskId,
        });

        if (!ok) {
            this.logger.error({
                message: `Failed to write graphs to ${fileName} for repository ${repoData.repositoryName}`,
                context: WORKER_CONTEXT,
                metadata: { request: JSON.stringify(repoData) },
                serviceName: WORKER_CONTEXT,
            });
            throw new Error(
                `Failed to write graphs to ${fileName} for repository ${repoData.repositoryName}`,
            );
        }

        // Save graphs metadata to task results
        try {
            // Determine storage type based on S3_ENABLED setting
            const s3Enabled = getEnvVariableAsBoolean('S3_ENABLED', false);
            const storageType = s3Enabled ? 's3' : 'local';

            await this.taskResultStorageService.saveGraphsMetadata(taskId, {
                storageType,
                repository: repoData.repositoryName,
                commit: repoData.commitSha ?? '',
                size: graphsSize,
            });

            this.logger.log({
                message: `Saved graphs metadata for task ${taskId}`,
                context: WORKER_CONTEXT,
                metadata: {
                    taskId,
                    repository: repoData.repositoryName,
                    size: graphsSize,
                },
                serviceName: WORKER_CONTEXT,
            });
        } catch (error) {
            this.logger.warn({
                message: `Failed to save graphs metadata for task ${taskId}`,
                context: WORKER_CONTEXT,
                error,
                metadata: {
                    taskId,
                    repository: repoData.repositoryName,
                },
                serviceName: WORKER_CONTEXT,
            });
            // Don't throw error - graphs are saved, metadata is optional
        }

        this.logger.log({
            message: `Stored graphs in ${fileName} for repository ${repoData.repositoryName}`,
            context: WORKER_CONTEXT,
            metadata: {
                filePath: path.join(repoData.repositoryName, fileName),
                size: graphsSize,
            },
            serviceName: WORKER_CONTEXT,
        });
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
