import { CodeAnalyzerService } from '@/core/infrastructure/adapters/services/ast/code-analyzer.service';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/ast/code-knowledge-graph.service';
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
    EnrichedGraph,
    CodeGraph,
} from '@kodus/kodus-proto/v2';
import { ASTSerializer } from '@kodus/kodus-proto/serialization/ast';
import { Injectable } from '@nestjs/common';
import * as path from 'path';

@Injectable()
export class InitializeRepositoryUseCase {
    constructor(
        private readonly repositoryManagerService: RepositoryManagerService,
        private readonly codeKnowledgeGraphService: CodeKnowledgeGraphService,
        private readonly codeAnalyzerService: CodeAnalyzerService,

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

            await this.storeGraphs(
                headRepo,
                baseGraph,
                baseDirPath,
                headGraph,
                headDirPath,
                enrichedHeadGraph,
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
                serviceName: InitializeRepositoryUseCase.name,
            });

            throw error;
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
        const data = Buffer.from(graphsJson, 'utf-8');

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
