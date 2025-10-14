import { DeleteRepositoryUseCase } from './graphs/delete-repository.use-case.js';
import { GetContentFromDiffUseCase } from './graphs/get-content-diff.use-case.js';
import { GetGraphsUseCase } from './graphs/get-graphs.use-case.js';
import { GetImpactAnalysisUseCase } from './analysis/get-impact-analysis.use-case.js';
import { InitializeImpactAnalysisUseCase } from './analysis/initialize-impact-analysis.use-case.js';
import { InitializeRepositoryUseCase } from './graphs/initialize-repository.use-case.js';

export const useCases = [
    InitializeRepositoryUseCase,
    DeleteRepositoryUseCase,
    GetGraphsUseCase,
    GetContentFromDiffUseCase,

    InitializeImpactAnalysisUseCase,
    GetImpactAnalysisUseCase,
];
