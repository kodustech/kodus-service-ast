// Query use cases (read operations)
import { GetGraphsUseCase } from './get-graphs.use-case.js';
import { GetImpactAnalysisUseCase } from './get-impact-analysis.use-case.js';
import { GetContentFromDiffUseCase } from './get-content-diff.use-case.js';

// Re-export for external use
export { GetGraphsUseCase } from './get-graphs.use-case.js';
export { GetImpactAnalysisUseCase } from './get-impact-analysis.use-case.js';
export { GetContentFromDiffUseCase } from './get-content-diff.use-case.js';

// All queries (available for both API and worker)
export const queries = [
    GetGraphsUseCase,
    GetImpactAnalysisUseCase,
    GetContentFromDiffUseCase,
];
