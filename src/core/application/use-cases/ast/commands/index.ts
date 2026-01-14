// Command use cases (write operations)
import { DeleteRepositoryUseCase } from './delete-repository.use-case.js';
import { InitializeImpactAnalysisUseCase } from './initialize-impact-analysis.use-case.js';
import { ValidateCodeUseCase } from './validate-code.use-case.js';

// Re-export for external use
export { DeleteRepositoryUseCase } from './delete-repository.use-case.js';
export { InitializeImpactAnalysisUseCase } from './initialize-impact-analysis.use-case.js';
export { ValidateCodeUseCase } from './validate-code.use-case.js';

// Worker commands (async operations)
export const workerCommands = [InitializeImpactAnalysisUseCase, ValidateCodeUseCase];

// API commands (sync operations)
export const apiCommands = [
    InitializeImpactAnalysisUseCase,
    DeleteRepositoryUseCase,
];
