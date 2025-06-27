import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service';
import {
    GrpcInvalidArgumentException,
    GrpcNotFoundException,
} from '@/shared/utils/grpc/exceptions';
import {
    GetImpactAnalysisResponse,
    InitializeImpactAnalysisRequest,
} from '@kodus/kodus-proto/ast';
import { Injectable } from '@nestjs/common';
import { GetGraphsUseCase } from '../graphs/get-graphs.use-case';
import { GraphAnalyzerService } from '@/core/infrastructure/adapters/services/graph-analysis/graph-analyzer.service';
import { handleError } from '@/shared/utils/errors';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service';
import { ChangeResult } from '@/core/domain/diff/types/diff-analyzer.types';
import { RepositoryData } from '@kodus/kodus-proto/ast/v2';

@Injectable()
export class InitializeImpactAnalysisUseCase {
    constructor(
        private readonly taskManagerService: TaskManagerService,
        private readonly graphAnalyzerService: GraphAnalyzerService,
        private readonly repositoryManagerService: RepositoryManagerService,

        private readonly getGraphsUseCase: GetGraphsUseCase,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        request: InitializeImpactAnalysisRequest,
        taskId?: string,
    ): Promise<void> {
        const { baseRepo, headRepo, codeChunk, fileName } = request;

        if (!baseRepo || !headRepo) {
            throw new GrpcInvalidArgumentException(
                'Both baseRepo and headRepo must be provided',
            );
        }

        try {
            this.startTask(taskId, 'Getting graphs');
            const graphs = await this.getGraphsUseCase.execute(request, false);

            if (!graphs) {
                throw new GrpcNotFoundException(
                    `No graphs found for repository ${headRepo.repositoryName}`,
                );
            }

            this.updateTaskState(taskId, 'Analyzing graphs');
            const analysisResult =
                this.graphAnalyzerService.analyzeCodeWithGraph(
                    codeChunk,
                    fileName,
                    graphs,
                );

            if (!analysisResult) {
                throw new GrpcNotFoundException(
                    `No analysis result found for code chunk in file ${fileName}`,
                );
            }

            this.updateTaskState(taskId, 'Generating impact analysis');
            const impactAnalysis =
                await this.graphAnalyzerService.generateImpactAnalysis(
                    graphs,
                    analysisResult,
                );

            if (!impactAnalysis) {
                throw new GrpcNotFoundException(
                    `No impact analysis generated for code chunk in file ${fileName}`,
                );
            }

            this.updateTaskState(taskId, 'Storing impact analysis');
            await this.storeImpactAnalysis(
                headRepo,
                analysisResult,
                impactAnalysis,
            );

            this.completeTask(taskId, 'Impact analysis completed successfully');
        } catch (error) {
            this.logger.error({
                message: 'Error during impact analysis initialization',
                error,
                context: InitializeImpactAnalysisUseCase.name,
                metadata: {
                    fileName,
                    taskId,
                },
                serviceName: InitializeImpactAnalysisUseCase.name,
            });

            this.failTask(
                taskId,
                handleError(error).message,
                'Impact analysis initialization failed',
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

    private async storeImpactAnalysis(
        repoData: RepositoryData,
        analysisResult: ChangeResult,
        impactAnalysis: GetImpactAnalysisResponse,
    ): Promise<void> {
        const fileName = `impact-analysis`;
        const data = {
            analysisResult,
            impactAnalysis,
        };
        const jsonData = JSON.stringify(data, null, 2);

        await this.repositoryManagerService.writeFile({
            repoData,
            filePath: fileName,
            data: jsonData,
            inKodusDir: true,
        });

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
