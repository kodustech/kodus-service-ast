import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { type TaskContext } from '@/core/domain/task/contracts/task-manager.contract.js';

import {
    GetImpactAnalysisResponse,
    InitializeImpactAnalysisRequest,
    RepositoryData,
} from '@/shared/types/ast.js';
import { Inject, Injectable } from '@nestjs/common';
import { GetGraphsUseCase } from '../queries/get-graphs.use-case.js';
import { GraphAnalyzerService } from '@/core/infrastructure/adapters/services/graph-analysis/graph-analyzer.service.js';
import { handleError } from '@/shared/utils/errors.js';
import { ChangeResult } from '@/core/domain/diff/types/diff-analyzer.types.js';
import {
    type IRepositoryManager,
    REPOSITORY_MANAGER_TOKEN,
} from '@/core/domain/repository/contracts/repository-manager.contract.js';

@Injectable()
export class InitializeImpactAnalysisUseCase {
    constructor(
        private readonly graphAnalyzerService: GraphAnalyzerService,

        @Inject(REPOSITORY_MANAGER_TOKEN)
        private readonly repositoryManagerService: IRepositoryManager,

        private readonly getGraphsUseCase: GetGraphsUseCase,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        request: InitializeImpactAnalysisRequest,
        taskContext?: TaskContext,
    ): Promise<void> {
        const { baseRepo, headRepo, codeChunk, fileName, taskId } = request;

        if (!baseRepo || !headRepo) {
            throw new Error('Both baseRepo and headRepo must be provided');
        }

        try {
            if (taskContext) {
                await taskContext.start('Getting graphs');
            }
            const graphs = await this.getGraphsUseCase.execute(request, false);

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
            );

            if (taskContext) {
                await taskContext.complete(
                    'Impact analysis completed successfully',
                );
            }
        } catch (error) {
            this.logger.error({
                message: 'Error during impact analysis initialization',
                error,
                context: InitializeImpactAnalysisUseCase.name,
                metadata: {
                    fileName,
                    taskId: taskContext?.taskId,
                },
                serviceName: InitializeImpactAnalysisUseCase.name,
            });

            if (taskContext) {
                await taskContext.fail(
                    handleError(error).message,
                    'Impact analysis initialization failed',
                );
            }
        }
    }

    private async storeImpactAnalysis(
        repoData: RepositoryData,
        analysisResult: ChangeResult,
        impactAnalysis: GetImpactAnalysisResponse,
        taskId: string,
    ): Promise<void> {
        const fileName = `impact-analysis`;
        const data = {
            analysisResult,
            impactAnalysis,
        };
        const jsonData = JSON.stringify(data, null, 2);

        const ok = await this.repositoryManagerService.writeFile({
            repoData,
            filePath: fileName,
            data: jsonData,
            taskId,
            inKodusDir: true,
        });
        if (!ok) {
            this.logger.error({
                message: `Failed to write impact analysis for repository ${repoData.repositoryName}`,
                context: InitializeImpactAnalysisUseCase.name,
                metadata: {
                    repoName: repoData.repositoryName,
                    filePath: fileName,
                },
                serviceName: InitializeImpactAnalysisUseCase.name,
            });
            throw new Error(
                `Failed to write impact analysis for repository ${repoData.repositoryName}`,
            );
        }

        this.logger.log({
            message: `Stored impact analysis for repository ${repoData.repositoryName}`,
            context: InitializeImpactAnalysisUseCase.name,
            metadata: {
                repoName: repoData.repositoryName,
                filePath: fileName,
            },
            serviceName: InitializeImpactAnalysisUseCase.name,
        });
    }
}
