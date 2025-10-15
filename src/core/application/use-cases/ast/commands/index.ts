// Command use cases (write operations)
import { InitializeRepositoryUseCase } from './initialize-repository.use-case.js';
import { InitializeImpactAnalysisUseCase } from './initialize-impact-analysis.use-case.js';
import { DeleteRepositoryUseCase } from './delete-repository.use-case.js';

// Re-export for external use
export { InitializeRepositoryUseCase } from './initialize-repository.use-case.js';
export { InitializeImpactAnalysisUseCase } from './initialize-impact-analysis.use-case.js';
export { DeleteRepositoryUseCase } from './delete-repository.use-case.js';

// Worker commands (async operations)
export const workerCommands = [
    InitializeRepositoryUseCase,
    InitializeImpactAnalysisUseCase,
];

// API commands (sync operations)
export const apiCommands = [
    InitializeRepositoryUseCase,
    InitializeImpactAnalysisUseCase,
    DeleteRepositoryUseCase,
];
