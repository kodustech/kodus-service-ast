// Command use cases (write operations)
import { InitializeImpactAnalysisUseCase } from './initialize-impact-analysis.use-case.js';
import { DeleteRepositoryUseCase } from './delete-repository.use-case.js';

// Re-export for external use
export { InitializeImpactAnalysisUseCase } from './initialize-impact-analysis.use-case.js';
export { DeleteRepositoryUseCase } from './delete-repository.use-case.js';

// Worker commands (async operations)
export const workerCommands = [InitializeImpactAnalysisUseCase];

// API commands (sync operations)
export const apiCommands = [
    InitializeImpactAnalysisUseCase,
    DeleteRepositoryUseCase,
];
