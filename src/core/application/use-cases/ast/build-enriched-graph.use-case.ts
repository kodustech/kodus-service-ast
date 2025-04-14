import { FunctionAnalysis } from '@/core/domain/ast/contracts/CodeGraph';
import {
    CodeAnalyzerService,
    EnrichGraph,
} from '@/core/infrastructure/adapters/services/ast/code-analyzer.service';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/ast/code-knowledge-graph.service';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service';
import {
    kodusRPCBuildEnrichedGraphRequest,
    kodusRPCCloneRepositoryRequest,
} from '@/proto/kodus/ast/analyzer';
import { Injectable } from '@nestjs/common';
import * as path from 'path';

type CodeGraphContext = {
    codeGraphFunctions: Map<string, FunctionAnalysis>;
    cloneDir: string;
};

type CodeAnalysisAST = {
    processedChunk?: string;
    headCodeGraph: CodeGraphContext;
    baseCodeGraph: CodeGraphContext;
    headCodeGraphEnriched?: EnrichGraph;
};

@Injectable()
export class BuildEnrichedGraphUseCase {
    constructor(
        private readonly repositoryManagerService: RepositoryManagerService,
        private readonly codeKnowledgeGraphService: CodeKnowledgeGraphService,
        private readonly codeAnalyzerService: CodeAnalyzerService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        request: kodusRPCBuildEnrichedGraphRequest,
    ): Promise<CodeAnalysisAST> {
        try {
            const { baseRepo, headRepo } = request;

            const baseDirPath = await this.cloneRepo(baseRepo);
            const headDirPath = await this.cloneRepo(headRepo);

            const progressCallback = (processed: number, total: number) => {
                const percentage = Math.round((processed / total) * 100);
                console.log(
                    `Progess: ${processed}/${total} files (${percentage}%)`,
                );
            };

            const headGraph =
                await this.codeKnowledgeGraphService.buildGraphProgressively(
                    headDirPath,
                    progressCallback,
                );

            const baseGraph =
                await this.codeKnowledgeGraphService.buildGraphProgressively(
                    baseDirPath,
                    progressCallback,
                );

            const enrichedHeadGraph =
                this.codeAnalyzerService.enrichGraph(headGraph);

            await this.deleteRepo(headRepo);
            await this.deleteRepo(baseRepo);

            return {
                baseCodeGraph: {
                    codeGraphFunctions: baseGraph.functions,
                    cloneDir: baseDirPath,
                },
                headCodeGraph: {
                    codeGraphFunctions: headGraph.functions,
                    cloneDir: headDirPath,
                },
                headCodeGraphEnriched: enrichedHeadGraph,
            };
        } catch (error) {
            this.logger.error({
                message: 'Failed to build enriched graph',
                context: BuildEnrichedGraphUseCase.name,
                error: error,
                metadata: {
                    request: JSON.stringify(request),
                },
            });
            await this.deleteRepo(request.baseRepo);
            await this.deleteRepo(request.headRepo);
            throw new Error('Failed to build enriched graph');
        }
    }

    private async cloneRepo(
        repo: kodusRPCCloneRepositoryRequest,
    ): Promise<string> {
        const repoDir =
            await this.repositoryManagerService.gitCloneWithAuth(repo);

        if (!repoDir || repoDir.trim() === '') {
            throw new Error('Failed to clone repository');
        }

        this.logger.log({
            message: `Cloned repository to ${repoDir}`,
            context: BuildEnrichedGraphUseCase.name,
            metadata: {
                request: JSON.stringify(repo),
            },
        });

        return path.resolve(repoDir);
    }

    private async deleteRepo(
        repo: kodusRPCCloneRepositoryRequest,
    ): Promise<void> {
        await this.repositoryManagerService.deleteLocalRepository(
            repo.organizationId,
            repo.repositoryId,
            repo.repositoryName,
            repo.branch,
        );

        this.logger.log({
            message: `Deleted repository ${repo.repositoryName}`,
            context: BuildEnrichedGraphUseCase.name,
            metadata: {
                request: JSON.stringify(repo),
            },
        });
    }
}
