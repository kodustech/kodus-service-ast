import { FunctionAnalysis } from '@/core/domain/ast/contracts/CodeGraph';
import {
    CodeAnalyzerService,
    EnrichGraph,
} from '@/core/infrastructure/adapters/services/ast/code-analyzer.service';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/ast/code-knowledge-graph.service';
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
export class AnalyzeDependenciesUseCase {
    constructor(
        private readonly codeKnowledgeGraphService: CodeKnowledgeGraphService,
        private readonly codeAnalyzerService: CodeAnalyzerService,
    ) {}

    async execute(headDIr: string, baseDir: string): Promise<CodeAnalysisAST> {
        try {
            if (!baseDir || baseDir.trim() === '') {
                throw new Error('Invalid base directory');
            }
            if (!headDIr || headDIr.trim() === '') {
                throw new Error('Invalid head directory');
            }

            const headDirPath = path.resolve(headDIr);
            const baseDirPath = path.resolve(baseDir);

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
            console.error('❌ Erro na análise:', error);
            throw error;
        }
    }
}
