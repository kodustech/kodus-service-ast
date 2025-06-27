import { GraphEnrichmentService } from '@/core/infrastructure/adapters/services/enrichment/graph-enrichment.service';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/parsing/code-knowledge-graph.service';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service';
import { handleError } from '@/shared/utils/errors';
import {
    GrpcInternalException,
    GrpcInvalidArgumentException,
} from '@/shared/utils/grpc/exceptions';
import {
    RepositoryData,
    EnrichedGraph,
    CodeGraph,
} from '@kodus/kodus-proto/ast/v2';
import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service';
import { InitializeRepositoryRequest } from '@kodus/kodus-proto/ast';
import { ASTSerializer } from '@kodus/kodus-proto/serialization/ast';

@Injectable()
export class InitializeRepositoryUseCase {
    constructor(
        private readonly repositoryManagerService: RepositoryManagerService,
        private readonly codeKnowledgeGraphService: CodeKnowledgeGraphService,
        private readonly codeAnalyzerService: GraphEnrichmentService,

        private readonly taskManagerService: TaskManagerService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        request: InitializeRepositoryRequest,
        taskId?: string,
    ): Promise<void> {
        const { baseRepo, headRepo, filePaths = [] } = request;

        if (!baseRepo || !headRepo) {
            throw new GrpcInvalidArgumentException(
                'Both baseRepo and headRepo must be provided',
            );
        }

        try {
            this.startTask(taskId, 'Cloning base repository');
            const baseDirPath = await this.cloneRepo(baseRepo);

            this.updateTaskState(taskId, 'Cloning head repository');
            const headDirPath = await this.cloneRepo(headRepo);

            this.updateTaskState(taskId, 'Building head graph');
            const headGraph =
                await this.codeKnowledgeGraphService.buildGraphProgressively(
                    headDirPath,
                    filePaths,
                );

            this.updateTaskState(taskId, 'Building base graph');
            const baseGraph =
                await this.codeKnowledgeGraphService.buildGraphProgressively(
                    baseDirPath,
                    filePaths,
                );

            this.updateTaskState(taskId, 'Building enriched head graph');
            const enrichedHeadGraph =
                this.codeAnalyzerService.enrichGraph(headGraph);

            this.updateTaskState(taskId, 'Storing graphs');
            await this.storeGraphs(
                headRepo,
                baseGraph,
                baseDirPath,
                headGraph,
                headDirPath,
                enrichedHeadGraph,
            );

            this.completeTask(taskId, 'Repository initialized successfully');

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

            this.failTask(
                taskId,
                handleError(error).message,
                'Initialization failed',
            );

            throw error;
        }
    }

    private startTask(taskId: string | undefined, state?: string): void {
        if (taskId) {
            this.taskManagerService.startTask(taskId, state);
        }
    }

    private updateTaskState(taskId: string | undefined, state?: string): void {
        if (taskId) {
            this.taskManagerService.updateTaskState(taskId, state);
        }
    }

    private completeTask(taskId: string | undefined, state?: string): void {
        if (taskId) {
            this.taskManagerService.completeTask(taskId, state);
        }
    }

    private failTask(
        taskId: string | undefined,
        error: string,
        state?: string,
    ): void {
        if (taskId) {
            this.taskManagerService.failTask(taskId, error, state);
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
            throw new GrpcInternalException('Failed to clone repository');
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
        const fileName = `graphs`;
        const graphs = ASTSerializer.serializeGetGraphsResponseData({
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

        await this.repositoryManagerService.writeFile({
            repoData,
            filePath: fileName,
            data: graphsJson,
            inKodusDir: true,
        });

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
