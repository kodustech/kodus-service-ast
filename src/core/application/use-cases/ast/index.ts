import { DeleteRepositoryUseCase } from './graphs/delete-repository.use-case';
import { GetContentFromDiffUseCase } from './graphs/get-content-diff.use-case';
import { GetGraphsUseCase } from './graphs/get-graphs.use-case';
import { GetImpactAnalysisUseCase } from './analysis/get-impact-analysis.use-case';
import { GetTaskInfoUseCase } from './tasks/get-task-info.use-case';
import { InitializeImpactAnalysisUseCase } from './analysis/initialize-impact-analysis.use-case';
import { InitializeRepositoryUseCase } from './graphs/initialize-repository.use-case';

export const UseCases = [
    InitializeRepositoryUseCase,
    DeleteRepositoryUseCase,
    GetGraphsUseCase,
    GetContentFromDiffUseCase,

    InitializeImpactAnalysisUseCase,
    GetImpactAnalysisUseCase,

    GetTaskInfoUseCase,
];
