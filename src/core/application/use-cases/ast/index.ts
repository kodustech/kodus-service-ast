import { DeleteRepositoryUseCase } from './delete-repository.use-case';
import { GetGraphsUseCase } from './get-graphs.use-case';
import { InitializeRepositoryUseCase } from './initialize-repository.use-case';

export const UseCases = [
    InitializeRepositoryUseCase,
    DeleteRepositoryUseCase,
    GetGraphsUseCase,
];
