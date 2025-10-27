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
import { GraphAnalyzerService } from '@/core/infrastructure/adapters/services/graph-analysis/graph-analyzer.service.js';
import { GetGraphsUseCase } from '@/core/application/use-cases/ast/queries/get-graphs.use-case.js';
import {
    InitializeRepositoryRequest,
    InitializeImpactAnalysisRequest,
} from '@/shared/types/ast.js';
import { astSerializer } from '@/shared/utils/ast-serialization.js';
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
        @Inject(GraphAnalyzerService)
        private readonly graphAnalyzerService: GraphAnalyzerService,
        @Inject(GetGraphsUseCase)
        private readonly getGraphsUseCase: GetGraphsUseCase,
        @Inject(TaskContextService)
        private readonly taskContextService: TaskContextService,
        @Inject(PinoLoggerService)
        private readonly logger: PinoLoggerService,
    ) {}

    async process(message: TaskQueueMessage): Promise<void> {
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

    private async processInitializeRepository(
        request: InitializeRepositoryRequest,
        taskContext: any,
    ): Promise<void> {
        const { baseRepo, headRepo, filePaths = [] } = request;
        const taskId = request?.taskId ?? taskContext?.taskId;

        if (!baseRepo || !headRepo) {
            const error = new Error(
                'Both baseRepo and headRepo must be provided',
            );
            (error as any).errorType = 'BUSINESS_ERROR';
            throw error;
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
        const { baseRepo, headRepo, codeChunk, fileName, graphsTaskId } =
            request;
        const taskId = request?.taskId ?? taskContext?.taskId;

        if (!baseRepo || !headRepo) {
            const error = new Error(
                'Both baseRepo and headRepo must be provided',
            );
            (error as any).errorType = 'BUSINESS_ERROR';
            throw error;
        }

        if (!graphsTaskId) {
            const error = new Error(
                'graphsTaskId must be provided to fetch existing graphs',
            );
            (error as any).errorType = 'BUSINESS_ERROR';
            throw error;
        }

        try {
            if (taskContext) {
                await taskContext.start('Getting graphs');
            }
            // Busca graphs usando o taskId dos graphs existentes
            const graphsRequest = {
                ...request,
                taskId: graphsTaskId, // Usa o taskId dos graphs, não o taskId atual
            };
            const graphs = await this.getGraphsUseCase.execute(
                graphsRequest,
                false,
            );

            if (!graphs) {
                throw new Error(
                    `No graphs found for repository ${headRepo.repositoryName}`,
                );
            }

            if (taskContext) {
                await taskContext.update('Analyzing graphs');
            }
            const analysisResult =
                this.graphAnalyzerService.analyzeCodeWithGraph(
                    codeChunk,
                    fileName,
                    graphs,
                );

            if (!analysisResult) {
                throw new Error(
                    `No analysis result found for code chunk in file ${fileName}`,
                );
            }

            if (taskContext) {
                await taskContext.update('Generating impact analysis');
            }
            const impactAnalysis =
                await this.graphAnalyzerService.generateImpactAnalysis(
                    graphs,
                    analysisResult,
                );

            if (!impactAnalysis) {
                throw new Error(
                    `No impact analysis generated for code chunk in file ${fileName}`,
                );
            }

            if (taskContext) {
                await taskContext.update('Storing impact analysis');
            }
            await this.storeImpactAnalysis(
                headRepo,
                analysisResult,
                impactAnalysis,
                taskId,
                graphsTaskId, // Passa o graphsTaskId para incluir nos metadados
            );

            if (taskContext) {
                await taskContext.complete(
                    'Impact analysis completed successfully',
                );
            }
        } catch (error) {
            this.logger.error({
                message: 'Error during impact analysis initialization',
                context: WORKER_CONTEXT,
                error,
                metadata: {
                    fileName,
                    taskId: taskContext?.taskId,
                },
                serviceName: WORKER_CONTEXT,
            });

            if (taskContext) {
                await taskContext.fail(
                    error instanceof Error ? error.message : 'Unknown error',
                    'Impact analysis initialization failed',
                );
            }
            throw error;
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
            const error = new Error('Failed to clone repository');
            (error as any).errorType = 'BUSINESS_ERROR';
            throw error;
        }

        this.logger.log({
            message: `Cloned repository to ${repoDir}`,
            context: WORKER_CONTEXT,
            metadata: { request: JSON.stringify(repoData) },
            serviceName: WORKER_CONTEXT,
        });

        return path.resolve(repoDir);
    }

    private async storeImpactAnalysis(
        repoData: any,
        analysisResult: any,
        impactAnalysis: any,
        taskId: string,
        graphsTaskId: string,
    ): Promise<void> {
        const fileName = 'impact-analysis';
        const data = {
            analysisResult,
            impactAnalysis,
            graphsTaskId,
        };
        const jsonData = JSON.stringify(data, null, 2);

        const ok = await this.repositoryManagerService.writeFile({
            repoData,
            filePath: fileName,
            data: jsonData,
            taskId,
            inKodusDir: true,
            graphsTaskId, // Passa o graphsTaskId para incluir nos metadados
        });
        if (!ok) {
            this.logger.error({
                message: `Failed to write impact analysis for repository ${repoData.repositoryName}`,
                context: WORKER_CONTEXT,
                metadata: {
                    repoName: repoData.repositoryName,
                    filePath: fileName,
                },
                serviceName: WORKER_CONTEXT,
            });
            const error = new Error(
                `Failed to write impact analysis for repository ${repoData.repositoryName}`,
            );
            (error as any).errorType = 'SYSTEM_ERROR';
            throw error;
        }

        this.logger.log({
            message: `Stored impact analysis for repository ${repoData.repositoryName}`,
            context: WORKER_CONTEXT,
            metadata: {
                repoName: repoData.repositoryName,
                filePath: fileName,
            },
            serviceName: WORKER_CONTEXT,
        });
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

        // Serialize graphs with streaming approach for large datasets
        const graphs = await this.serializeGraphsStreaming({
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

        // Use compact JSON to reduce memory usage
        const graphsJson = JSON.stringify(graphs);
        const graphsSize = Buffer.byteLength(graphsJson, 'utf8');

        this.logger.log({
            message: 'Writing graphs to storage',
            context: 'TaskQueueProcessor',
            metadata: {
                taskId,
                repository: repoData.repositoryName,
                graphsSize,
                memoryUsage: this.getMemoryUsageMB(),
            },
        });

        // Force garbage collection after serialization
        this.forceGarbageCollection();

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
            const error = new Error(
                `Failed to write graphs to ${fileName} for repository ${repoData.repositoryName}`,
            );
            (error as any).errorType = 'SYSTEM_ERROR';
            throw error;
        }

        // Metadata is now saved automatically in RepositoryManagerService.writeFile()

        this.logger.log({
            message: `Stored graphs in ${fileName} for repository ${repoData.repositoryName}`,
            context: WORKER_CONTEXT,
            metadata: {
                filePath: path.join(repoData.repositoryName, fileName),
                size: graphsSize,
                memoryUsage: this.getMemoryUsageMB(),
            },
            serviceName: WORKER_CONTEXT,
        });
    }

    /**
     * Serialize graphs with streaming approach for large datasets
     */
    private async serializeGraphsStreaming(graphsData: any): Promise<any> {
        try {
            // Use the existing serializer but with memory monitoring
            const result =
                astSerializer.serializeGetGraphsResponseData(graphsData);

            // Force garbage collection after serialization
            this.forceGarbageCollection();

            return result;
        } catch (error) {
            this.logger.error({
                message: 'Failed to serialize graphs',
                context: WORKER_CONTEXT,
                error,
                metadata: {
                    memoryUsage: this.getMemoryUsageMB(),
                },
                serviceName: WORKER_CONTEXT,
            });
            throw error;
        }
    }

    /**
     * Get current memory usage in MB
     */
    private getMemoryUsageMB(): number {
        const memUsage = process.memoryUsage();
        return Math.round(memUsage.heapUsed / 1024 / 1024);
    }

    /**
     * Force garbage collection if available
     */
    private forceGarbageCollection(): void {
        if (global.gc) {
            try {
                global.gc();
                this.logger.debug({
                    message: 'Forced garbage collection',
                    context: WORKER_CONTEXT,
                    serviceName: WORKER_CONTEXT,
                });
            } catch (error) {
                this.logger.warn({
                    message: 'Failed to force garbage collection',
                    context: WORKER_CONTEXT,
                    error,
                    serviceName: WORKER_CONTEXT,
                });
            }
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
