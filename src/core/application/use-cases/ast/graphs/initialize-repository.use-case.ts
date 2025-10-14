import { GraphEnrichmentService } from '@/core/infrastructure/adapters/services/enrichment/graph-enrichment.service.js';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/parsing/code-knowledge-graph.service.js';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { handleError } from '@/shared/utils/errors.js';

import {
    CodeGraph,
    EnrichedGraph,
    InitializeRepositoryRequest,
    RepositoryData,
} from '@/shared/types/ast.js';
import { Inject, Injectable } from '@nestjs/common';
import * as path from 'path';
import {
    type ITaskManagerService,
    TASK_MANAGER_TOKEN,
} from '@/core/domain/task/contracts/task-manager.contract.js';
import { astSerializer } from '@/shared/utils/ast-serialization.js';
import {
    type IRepositoryManager,
    REPOSITORY_MANAGER_TOKEN,
} from '@/core/domain/repository/contracts/repository-manager.contract.js';

@Injectable()
export class InitializeRepositoryUseCase {
    constructor(
        @Inject(REPOSITORY_MANAGER_TOKEN)
        private readonly repositoryManagerService: IRepositoryManager,
        private readonly codeKnowledgeGraphService: CodeKnowledgeGraphService,
        private readonly codeAnalyzerService: GraphEnrichmentService,

        @Inject(TASK_MANAGER_TOKEN)
        private readonly taskManagerService: ITaskManagerService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        request: InitializeRepositoryRequest,
        taskId?: string,
    ): Promise<void> {
        const { baseRepo, headRepo, filePaths = [] } = request;

        if (!baseRepo || !headRepo) {
            throw new Error('Both baseRepo and headRepo must be provided');
        }

        try {
            await this.startTask(taskId, 'Cloning base repository');
            const baseDirPath = await this.cloneRepo(baseRepo);

            await this.updateTaskState(taskId, 'Cloning head repository');
            const headDirPath = await this.cloneRepo(headRepo);

            await this.updateTaskState(taskId, 'Building head graph');
            const headGraph =
                await this.codeKnowledgeGraphService.buildGraphProgressively(
                    headDirPath,
                    filePaths,
                );

            await this.updateTaskState(taskId, 'Building base graph');
            const baseGraph =
                await this.codeKnowledgeGraphService.buildGraphProgressively(
                    baseDirPath,
                    filePaths,
                );

            await this.updateTaskState(taskId, 'Building enriched head graph');
            const enrichedHeadGraph =
                this.codeAnalyzerService.enrichGraph(headGraph);

            await this.updateTaskState(taskId, 'Storing graphs');
            await this.storeGraphs(
                headRepo,
                baseGraph,
                baseDirPath,
                headGraph,
                headDirPath,
                enrichedHeadGraph,
            );

            await this.completeTask(
                taskId,
                'Repository initialized successfully',
            );

            return;
        } catch (error) {
            this.logger.error({
                message: 'Failed to initialize repository',
                context: InitializeRepositoryUseCase.name,
                error,
                metadata: {
                    request,
                },
                serviceName: InitializeRepositoryUseCase.name,
            });

            await this.failTask(
                taskId,
                handleError(error).message,
                'Initialization failed',
            );
        }
    }

    private async startTask(
        taskId: string | undefined,
        state?: string,
    ): Promise<void> {
        if (taskId) {
            await this.taskManagerService.startTask(taskId, state);
        }
    }

    private async updateTaskState(
        taskId: string | undefined,
        state?: string,
    ): Promise<void> {
        if (taskId) {
            await this.taskManagerService.updateTaskState(
                taskId,
                state ?? 'Unknown',
            );
        }
    }

    private async completeTask(
        taskId: string | undefined,
        state?: string,
    ): Promise<void> {
        if (taskId) {
            await this.taskManagerService.completeTask(taskId, state);
        }
    }

    private async failTask(
        taskId: string | undefined,
        error: string,
        state?: string,
    ): Promise<void> {
        if (taskId) {
            await this.taskManagerService.failTask(taskId, error, state);
        }
    }

    private async cloneRepo(repoData: RepositoryData): Promise<string> {
        const repoDir = await this.repositoryManagerService.gitCloneWithAuth({
            repoData,
        });

        if (!repoDir || repoDir.trim() === '') {
            this.logger.error({
                message: 'Failed to clone repository',
                context: InitializeRepositoryUseCase.name,
                metadata: {
                    request: JSON.stringify(repoData),
                },
                serviceName: InitializeRepositoryUseCase.name,
            });
            throw new Error('Failed to clone repository');
        }

        this.logger.log({
            message: `Cloned repository to ${repoDir}`,
            context: InitializeRepositoryUseCase.name,
            metadata: {
                request: JSON.stringify(repoData),
            },
            serviceName: InitializeRepositoryUseCase.name,
        });

        return path.resolve(repoDir);
    }

    private async storeGraphs(
        repoData: RepositoryData,
        baseGraph: CodeGraph,
        baseGraphDir: string,
        headGraph: CodeGraph,
        headGraphDir: string,
        enrichHeadGraph: EnrichedGraph,
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

        const ok = await this.repositoryManagerService.writeFile({
            repoData,
            filePath: fileName,
            data: graphsJson,
            inKodusDir: true,
        });
        if (!ok) {
            this.logger.error({
                message: `Failed to write graphs to ${fileName} for repository ${repoData.repositoryName}`,
                context: InitializeRepositoryUseCase.name,
                metadata: {
                    request: JSON.stringify(repoData),
                },
                serviceName: InitializeRepositoryUseCase.name,
            });
            throw new Error(
                `Failed to write graphs to ${fileName} for repository ${repoData.repositoryName}`,
            );
        }

        this.logger.log({
            message: `Stored graphs in ${fileName} for repository ${repoData.repositoryName}`,
            context: InitializeRepositoryUseCase.name,
            metadata: {
                filePath: path.join(repoData.repositoryName, fileName),
            },
            serviceName: InitializeRepositoryUseCase.name,
        });
    }
}
