import { CodeAnalyzerService } from '@/core/infrastructure/adapters/services/ast/code-analyzer.service';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/ast/code-knowledge-graph.service';
import { SerializerService } from '@/core/infrastructure/adapters/services/ast/serializer.service';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service';
import { handleError } from '@/shared/utils/errors';
import {
    GrpcInternalException,
    GrpcInvalidArgumentException,
} from '@/shared/utils/grpc/exceptions';
import {
    InitializeRepositoryRequest,
    InitializeRepositoryResponse,
    RepositoryData,
    CodeGraph as SerializedCodeGraph,
    EnrichGraph as SerializedEnrichGraph,
    GetGraphsResponseData as SerializedGraphs,
} from '@kodus/kodus-proto/v2';
import { Injectable } from '@nestjs/common';
import * as path from 'path';

@Injectable()
export class InitializeRepositoryUseCase {
    constructor(
        private readonly repositoryManagerService: RepositoryManagerService,
        private readonly codeKnowledgeGraphService: CodeKnowledgeGraphService,
        private readonly codeAnalyzerService: CodeAnalyzerService,
        private readonly serializerService: SerializerService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        request: InitializeRepositoryRequest,
    ): Promise<InitializeRepositoryResponse> {
        const { baseRepo, headRepo } = request;

        if (!baseRepo || !headRepo) {
            throw new GrpcInvalidArgumentException(
                'Both baseRepo and headRepo must be provided',
            );
        }

        try {
            const baseDirPath = await this.cloneRepo(baseRepo);
            const headDirPath = await this.cloneRepo(headRepo);

            const headGraph =
                await this.codeKnowledgeGraphService.buildGraphProgressively(
                    headDirPath,
                );

            const baseGraph =
                await this.codeKnowledgeGraphService.buildGraphProgressively(
                    baseDirPath,
                );

            const enrichedHeadGraph =
                this.codeAnalyzerService.enrichGraph(headGraph);

            const serializedHeadGraph =
                this.serializerService.serializeCodeGraph(headGraph);

            const serializedBaseGraph =
                this.serializerService.serializeCodeGraph(baseGraph);

            const serializedEnrichedGraph =
                this.serializerService.serializeEnrichedGraph(
                    enrichedHeadGraph,
                );

            await this.storeGraphs(
                headRepo,
                serializedBaseGraph,
                serializedHeadGraph,
                serializedEnrichedGraph,
            );

            return {};
        } catch (error) {
            this.logger.error({
                message: 'Failed to initialize repository',
                context: InitializeRepositoryUseCase.name,
                error: handleError(error),
                metadata: {
                    request,
                },
            });

            throw error;
        }
    }

    private async cloneRepo(repoData: RepositoryData): Promise<string> {
        const repoDir =
            await this.repositoryManagerService.gitCloneWithAuth(repoData);

        if (!repoDir || repoDir.trim() === '') {
            this.logger.error({
                message: 'Failed to clone repository',
                context: InitializeRepositoryUseCase.name,
                metadata: {
                    request: JSON.stringify(repoData),
                },
            });
            throw new GrpcInternalException('Failed to clone repository');
        }

        this.logger.log({
            message: `Cloned repository to ${repoDir}`,
            context: InitializeRepositoryUseCase.name,
            metadata: {
                request: JSON.stringify(repoData),
            },
        });

        return path.resolve(repoDir);
    }

    private async storeGraphs(
        repoData: RepositoryData,
        baseGraph: SerializedCodeGraph,
        headGraph: SerializedCodeGraph,
        enrichHeadGraph: SerializedEnrichGraph,
    ): Promise<void> {
        const fileName = 'graphs';
        const graphs: SerializedGraphs = {
            baseGraph,
            headGraph,
            enrichHeadGraph,
        };

        const graphsJson = JSON.stringify(graphs, null, 2);
        const data = Buffer.from(graphsJson, 'utf-8');

        await this.repositoryManagerService.writeFile(repoData, fileName, data);

        this.logger.log({
            message: `Stored graphs in ${fileName} for repository ${repoData.repositoryName}`,
            context: InitializeRepositoryUseCase.name,
            metadata: {
                filePath: path.join(repoData.repositoryName, fileName),
            },
        });
    }
}
