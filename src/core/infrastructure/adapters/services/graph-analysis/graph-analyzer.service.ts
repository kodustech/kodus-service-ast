import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service.js';
import {
    EnrichedGraph,
    EnrichedGraphEdge,
    FunctionAnalysis,
    GetGraphsResponseData,
    GetImpactAnalysisResponse,
    NodeType,
    RelationshipType,
} from '@/shared/types/ast.js';
import * as path from 'path';
import {
    ChangeResult,
    FunctionResult,
    FunctionsAffect,
    FunctionsAffectResult,
    // FunctionSimilar,
    FunctionSimilarity,
    ImpactedNode,
    ImpactResult,
} from '@/core/domain/diff/types/diff-analyzer.types.js';
import { DiffAnalyzerService } from '../diff/diff-analyzer.service.js';
// import {
//     LLMModelProvider,
//     ParserType,
//     PromptRole,
//     PromptRunnerService,
// } from '@kodus/kodus-common/llm';
// import { promptCheckSimilarFunctionsSystem } from '@/core/domain/graph-analysis/prompts/similar-functions.prompt.js';

@Injectable()
export class GraphAnalyzerService {
    constructor(
        private readonly logger: PinoLoggerService,
        private readonly diffAnalyzerService: DiffAnalyzerService,
        // TODO: Re-enable PromptRunnerService when LLM module is properly configured
        // private readonly promptRunnerService: PromptRunnerService,
    ) {}

    analyzeCodeWithGraph(
        codeChunk: string,
        fileName: string,
        codeAnalysisAST: GetGraphsResponseData,
    ): ChangeResult {
        try {
            const processedChunk = this.preprocessCustomDiff(codeChunk);

            const prFilePath = path.join(
                codeAnalysisAST?.headGraph?.dir,
                fileName,
            );
            const baseFilePath = path.join(
                codeAnalysisAST?.baseGraph?.dir,
                fileName,
            );

            const functionsAffected = this.diffAnalyzerService.analyzeDiff(
                {
                    diff: processedChunk,
                    headCodeGraphFunctions:
                        codeAnalysisAST?.headGraph?.graph.functions,
                    prFilePath,
                },
                {
                    baseCodeGraphFunctions:
                        codeAnalysisAST?.baseGraph?.graph.functions,
                    baseFilePath,
                },
            );

            return functionsAffected;
        } catch (error) {
            this.logger.error({
                message: `Error analyzing code with graph`,
                context: GraphAnalyzerService.name,
                metadata: {
                    fileName,
                    codeChunk,
                },
                error,
            });
            throw error;
        }
    }

    private preprocessCustomDiff(diff: string): string {
        return diff
            .split(/\r?\n/)
            .map((line) => {
                const trimmed = line.trim();
                if (!trimmed) {
                    return '';
                }
                if (trimmed === '__new hunk__' || trimmed === '__old hunk__') {
                    return '';
                }
                const match = trimmed.match(/^(\d+)\s+([+\- ])(.*)/);
                if (match) {
                    const sign = match[2];
                    const remainder = match[3];
                    return sign + remainder;
                }
                return trimmed;
            })
            .join('\n');
    }

    async generateImpactAnalysis(
        codeAnalysis: GetGraphsResponseData,
        functionsAffected: ChangeResult,
    ): Promise<GetImpactAnalysisResponse> {
        try {
            const impactedNodes = this.computeImpactAnalysis(
                codeAnalysis?.enrichHeadGraph,
                [functionsAffected],
                1,
                'backward',
            );

            const functionSimilarity = await this.checkFunctionSimilarity(
                functionsAffected.added,
                codeAnalysis.headGraph.graph.functions,
            );

            const functionsAffect = this.buildFunctionsAffect(
                impactedNodes,
                codeAnalysis.baseGraph.graph.functions,
                codeAnalysis.headGraph.graph.functions,
            );

            return {
                functionsAffect,
                functionSimilarity,
            };
        } catch (error) {
            this.logger.error({
                message: `Error generating impact analysis`,
                context: GraphAnalyzerService.name,
                error,
            });
            throw error;
        }
    }

    computeImpactAnalysis(
        graph: EnrichedGraph,
        changeResults: ChangeResult[],
        depth: number = Infinity,
        direction: 'both' | 'forward' | 'backward' = 'backward',
        allowedTypes: RelationshipType[] = Array.from(
            new Set(graph.relationships.map((rel) => rel.type)),
        ),
    ): ImpactResult[] {
        const results: ImpactResult[] = [];

        for (const { modified, added, deleted } of changeResults) {
            const changedFunctions = [...modified, ...added, ...deleted];

            for (const func of changedFunctions) {
                const impactedNodes = this.dfs(
                    graph,
                    func.id,
                    direction,
                    allowedTypes,
                );

                if (impactedNodes.length === 0) {
                    continue;
                }

                // 🔄 3. Rastreia a propagação do impacto no grafo
                const impactReport = this.traceImpactPropagation(
                    graph,
                    func.id, // ✅ Passamos cada função alterada como startNode
                    impactedNodes,
                    allowedTypes,
                );

                // 🧠 4. Enriquecer com análise AST e armazenar o resultado
                const impactAnalysis = this.extractASTDependencies(
                    impactReport,
                    graph,
                    depth,
                );

                results.push({
                    function: func.fullName,
                    impact: impactAnalysis,
                });
            }
        }

        return results;
    }

    /**
     * Realiza uma busca em profundidade (DFS) em um grafo de dependências.
     * Suporta travessia nos sentidos direto, reverso ou bidirecional com filtragem por tipos de relacionamento.
     *
     * @param graph - O grafo de dependências contendo nós e relacionamentos.
     * @param startNodeId - O ID do nó inicial (por exemplo, "IntegrationService.getPlatformIntegration").
     * @param direction - Define a direção da travessia:
     *                    - "forward": Encontrar dependências (de quem esta função depende).
     *                    - "backward": Encontrar dependentes (quem depende desta função).
     *                    - "both": Traversar em ambas as direções.
     * @param allowedTypes - Tipos de relacionamento a serem seguidos (padrão para **todos** os tipos disponíveis no grafo).
     * @returns Um array de nós impactados.
     */
    dfs(
        graph: EnrichedGraph,
        startNodeId: string,
        direction: 'both' | 'forward' | 'backward' = 'both',
        allowedTypes: RelationshipType[] = Array.from(
            new Set(graph.relationships.map((rel) => rel.type)),
        ),
    ): string[] {
        const visited = new Set<string>();
        this.dfsHelper(graph, startNodeId, visited, direction, allowedTypes);
        return Array.from(visited); // Converte Set para Array antes de retornar
    }

    /**
     * Recursive DFS helper function.
     */
    private dfsHelper(
        graph: EnrichedGraph,
        currentNode: string,
        visited: Set<string>,
        direction: 'both' | 'forward' | 'backward',
        allowedTypes: RelationshipType[],
    ) {
        if (visited.has(currentNode)) {
            return;
        } // Evita loops infinitos
        visited.add(currentNode);

        for (const edge of graph.relationships) {
            const nextNode = this.getNextNode(
                edge,
                currentNode,
                direction,
                visited,
                allowedTypes,
            );
            if (nextNode) {
                this.dfsHelper(
                    graph,
                    nextNode,
                    visited,
                    direction,
                    allowedTypes,
                );
            }
        }
    }

    /**
     * Determines the next node to visit based on traversal direction and allowed relationships.
     */
    private getNextNode(
        edge: EnrichedGraphEdge,
        currentNode: string,
        direction: 'both' | 'forward' | 'backward',
        visited: Set<string>,
        allowedTypes: RelationshipType[],
    ): string | null {
        const isForward =
            direction !== 'backward' &&
            edge.from === currentNode &&
            !visited.has(edge.to);
        const isBackward =
            direction !== 'forward' &&
            edge.to === currentNode &&
            !visited.has(edge.from);

        if ((isForward || isBackward) && allowedTypes.includes(edge.type)) {
            return isForward ? edge.to : edge.from;
        }

        return null;
    }

    async checkFunctionSimilarity(
        addedFunctions: FunctionResult[],
        existingFunctions: Map<string, FunctionAnalysis>,
    ): Promise<FunctionSimilarity[]> {
        const functionsResult: FunctionSimilarity[] = [];

        for (const addedFunction of addedFunctions) {
            const candidateSimilarFunctions: FunctionAnalysis[] = [];

            for (const [, existingFunction] of existingFunctions) {
                if (
                    this.checkSignatureFunctionSimilarity(
                        addedFunction,
                        existingFunction,
                    )
                ) {
                    const { isSimilar } = this.checkBodyFunctionSimilarity(
                        addedFunction,
                        existingFunction,
                    );

                    if (isSimilar) {
                        candidateSimilarFunctions.push(existingFunction);
                    }
                }
            }

            const similarFunctions = await this.checkFunctionSimilarityWithLLM(
                addedFunction,
                candidateSimilarFunctions,
            );

            functionsResult.push({
                functionName: addedFunction.fullName,
                similarFunctions: similarFunctions || [],
            });
        }

        return functionsResult;
    }

    private checkSignatureFunctionSimilarity(
        addedFunction: FunctionResult,
        existingFunction: FunctionAnalysis,
    ): boolean {
        return addedFunction.signatureHash === existingFunction.signatureHash;
    }

    private checkBodyFunctionSimilarity(
        addedFunction: FunctionResult,
        existingFunction: FunctionAnalysis,
        jaccardThreshold: number = 0.5,
    ): { jaccardScore: number; isSimilar: boolean } {
        const jaccardScore = this.jaccardSimilarity(
            addedFunction.functionHash,
            existingFunction.functionHash,
        );

        return { jaccardScore, isSimilar: jaccardScore >= jaccardThreshold };
    }

    private jaccardSimilarity(s1: string, s2: string): number {
        // Tokeniza a string usando uma expressão regular que separa por caracteres não alfanuméricos.
        const tokens1 = new Set(
            s1.split(/\W+/).filter((token) => token.length > 0),
        );
        const tokens2 = new Set(
            s2.split(/\W+/).filter((token) => token.length > 0),
        );

        // Calcula a interseção dos tokens
        const intersection = new Set(
            [...tokens1].filter((token) => tokens2.has(token)),
        );
        // Calcula a união dos tokens
        const union = new Set([...tokens1, ...tokens2]);

        return union.size === 0 ? 1 : intersection.size / union.size;
    }

    buildFunctionsAffect(
        impactedNodes: ImpactResult[],
        oldFunctionAnalyses: Map<string, FunctionAnalysis>,
        newFunctionAnalyses: Map<string, FunctionAnalysis>,
    ): FunctionsAffectResult[] {
        const finalResult: FunctionsAffectResult[] = [];

        for (const impacted of impactedNodes) {
            // 1) Nome da função alterada (ex.: "MinhaClasse.meuMetodo")
            const impactedFunctionName = impacted.function;

            // 2) Acessar o "nível 0" => é a função alterada em si
            //    Precisamos do "oldFunction" e do "newFunction"
            //    Localizamos no oldFunctionAnalyses e newFunctionAnalyses
            //    Caso não exista "className", ajusta a busca como preferir.

            const oldAnalysis = this.findFunctionAnalysisById(
                impactedFunctionName,
                oldFunctionAnalyses,
            );
            const newAnalysis = this.findFunctionAnalysisById(
                impactedFunctionName,
                newFunctionAnalyses,
            );

            const oldFunctionCode = this.generateFunctionWithLines(
                oldAnalysis?.fullText || '',
                oldAnalysis?.startLine || 0,
            );

            const newFunctionCode = this.generateFunctionWithLines(
                newAnalysis?.fullText || '',
                newAnalysis?.startLine || 0,
            );

            // 3) Pegar todos os nós (flatten dos groupedByLevel)
            //    e filtrar para ignorar nível 0 (se não quiser repetí-lo)
            const allImpactedNodes = Object.values(
                impacted.impact.groupedByLevel,
            ).flat();
            // Se você quiser EXCLUIR a própria função alterada do “functionsAffect”:
            const affectedMethods = allImpactedNodes.filter(
                (node) => node.level > 0,
            );

            // 4) Mapear os nós impactados para o objeto `FunctionsAffect`
            const functionsAffect: FunctionsAffect[] = affectedMethods.map(
                (node) => {
                    const analysis = this.findFunctionAnalysisById(
                        node.id,
                        newFunctionAnalyses,
                    );
                    return {
                        functionName: node.name,
                        filePath: analysis?.file || '',
                        functionBody: this.generateFunctionWithLines(
                            analysis?.fullText || '',
                            analysis?.startLine || 0,
                        ),
                    };
                },
            );

            // 5) Montar o objeto final
            finalResult.push({
                oldFunction: oldFunctionCode,
                newFunction: newFunctionCode,
                functionsAffect: functionsAffect
                    ? Object.values(functionsAffect)
                    : [],
            });
        }

        return finalResult;
    }

    /**
     * Localiza um FunctionAnalysis combinando
     *  - ID do node (ex. "MinhaClasse.metodoX")
     *  - Campos do FunctionAnalysis (ex. className + name)
     *
     * Ajuste conforme a forma como você monta a “chave” no Record<string, FunctionAnalysis>.
     */
    findFunctionAnalysisById(
        nodeId: string,
        analysesRecord: Map<string, FunctionAnalysis>,
    ): FunctionAnalysis | undefined {
        // Exemplo simples:
        // Se nodeId = "MinhaClasse.metodoX", vamos dar split no '.' e comparar
        const [maybeClass, maybeMethod] = nodeId.split('.');
        const allAnalyses = Array.from(analysesRecord.values());
        // Se só existir “metodoX” sem classe, esse split retorna [ "metodoX" ] e maybeMethod fica undefined.
        // Ajuste se necessário.
        // Tente localizar no record um que bata com a className e name
        return allAnalyses.find((analysis) => {
            const hasSameFileAndName =
                // Se for algo do tipo "MinhaClasse.metodoX"
                (analysis.className === maybeClass &&
                    analysis.name === maybeMethod) ||
                // Se for só "metodoX"
                (analysis.name === maybeClass && !maybeMethod);

            return hasSameFileAndName;
        });
    }

    generateFunctionWithLines(code: string, lineStart: number): string {
        const lines = code?.split('\n');

        return lines
            ?.map((line, index) => `${lineStart + index} ${line}`)
            ?.join('\n');
    }

    /**
     * **Gera um relatório completo de impacto**
     */
    traceImpactPropagation(
        graph: EnrichedGraph,
        startNode: string,
        impactedNodes: string[],
        allowedTypes: RelationshipType[],
    ): ImpactedNode[] {
        const levels = this.groupByPropagation(graph, startNode, impactedNodes);

        return impactedNodes
            .filter((nodeId) => {
                // 🔎 Localiza o nó no grafo
                const node = graph.nodes.find((n) => n.id === nodeId);

                if (!node) {
                    return false;
                }

                // 🔥 Aqui focamos apenas em métodos/funções.
                // Se o node.type não for 'Method' ou 'Function', a gente ignora.
                return node.type === NodeType.NODE_TYPE_FUNCTION;
            })
            .map((nodeId) => {
                const node = graph.nodes.find((n) => n.id === nodeId);

                // 🔥 Buscar imports relevantes
                const importRelationships = graph.relationships.filter(
                    (rel) =>
                        rel.type ===
                            RelationshipType.RELATIONSHIP_TYPE_IMPORTS &&
                        rel.to === nodeId &&
                        allowedTypes.includes(rel.type),
                );

                return {
                    id: nodeId,
                    name: node?.name || '',
                    type: node?.type || NodeType.NODE_TYPE_FUNCTION,
                    severity: this.determineSeverity(graph, nodeId),
                    level: Number(
                        Object.entries(levels).find(([, nodes]) =>
                            nodes.includes(nodeId),
                        )?.[0] ?? -1,
                    ),
                    filePath: node?.filePath || '',
                    calledBy: this.getCalledByMethods(graph, nodeId).map((i) =>
                        i.toString(),
                    ),
                    importedBy: importRelationships
                        .map((rel) => rel.from)
                        .map((i) => i.toString()),
                };
            });
    }

    private groupByPropagation(
        graph: EnrichedGraph,
        startNode: string,
        impactedNodes: string[],
    ): Record<number, string[]> {
        const levels: Record<number, string[]> = {};
        const queue: { node: string; level: number }[] = [
            { node: startNode, level: 0 },
        ];
        const visited = new Set<string>();

        while (queue.length) {
            const { node, level } = queue.shift() || { node: '', level: 0 };
            if (visited.has(node)) {
                continue;
            }
            visited.add(node);

            if (!levels[level]) {
                levels[level] = [];
            }
            levels[level].push(node);

            for (const edge of graph.relationships) {
                if (edge.to === node && impactedNodes.includes(edge.from)) {
                    queue.push({ node: edge.from, level: level + 1 });
                }
            }
        }

        return levels;
    }

    extractASTDependencies(
        impactReport: ImpactedNode[],
        graph: any,
        depth: number = Infinity,
    ) {
        const groupedByLevel: Record<number, ImpactedNode[]> = {};
        const impactByType: Record<string, number> = {};

        impactReport
            .filter((impact) => impact.type === NodeType.NODE_TYPE_FUNCTION)
            ?.forEach((node) => {
                if (node.level > depth) {
                    return;
                }

                // 🔹 Agrupar por nível de propagação
                if (!groupedByLevel[node.level]) {
                    groupedByLevel[node.level] = [];
                }
                groupedByLevel[node.level].push(node);

                // 🔹 Contar quantos de cada tipo existem
                impactByType[node.type] = (impactByType[node.type] || 0) + 1;
            });

        return {
            summary: {
                totalImpact: Object.values(groupedByLevel).flat().length,
                highestLevel: Math.max(
                    ...Object.keys(groupedByLevel).map(Number),
                ),
                impactByType,
            },
            groupedByLevel,
        };
    }

    /**
     * **Determina a severidade do impacto baseando-se em conexões**
     */
    determineSeverity(graph: EnrichedGraph, nodeId: string): string {
        const relatedEdges = graph.relationships.filter(
            (rel) => rel.from === nodeId || rel.to === nodeId,
        );

        if (
            relatedEdges.some(
                (rel) =>
                    rel.type === RelationshipType.RELATIONSHIP_TYPE_CALLS ||
                    rel.type ===
                        RelationshipType.RELATIONSHIP_TYPE_CALLS_IMPLEMENTATION,
            )
        ) {
            return 'high'; // 🔴 Impacto crítico
        }

        if (
            relatedEdges.some(
                (rel) =>
                    rel.type ===
                        RelationshipType.RELATIONSHIP_TYPE_IMPLEMENTS ||
                    rel.type === RelationshipType.RELATIONSHIP_TYPE_EXTENDS ||
                    rel.type ===
                        RelationshipType.RELATIONSHIP_TYPE_IMPLEMENTED_BY,
            )
        ) {
            return 'medium'; // 🟠 Impacto médio (herança, interface)
        }

        return 'low'; // 🟢 Impacto baixo (importações, referências passivas)
    }

    private getCalledByMethods(
        graph: EnrichedGraph,
        methodId: string,
    ): string[] {
        // 1) Filtra relacionamentos do tipo CALLS onde 'to' seja o 'methodId'
        const callersIds = graph.relationships
            .filter(
                (rel) =>
                    rel.type === RelationshipType.RELATIONSHIP_TYPE_CALLS &&
                    rel.to === methodId,
            )
            .map((rel) => rel.from);

        // 2) Filtra nós cujo ID esteja em callersIds e cujo tipo seja 'Method' ou 'Function'
        const callerNodes = graph.nodes.filter(
            (node) =>
                callersIds.includes(node.id) &&
                node.type === NodeType.NODE_TYPE_FUNCTION,
        );

        // 3) Retorna apenas o campo 'id' de cada nó
        return callerNodes.map((node) => node.id);
    }

    private async checkFunctionSimilarityWithLLM(
        addedFunction: FunctionResult,
        existingFunctions: FunctionAnalysis[],
    ) {
        console.log(
            'checkFunctionSimilarityWithLLM',
            addedFunction,
            existingFunctions,
        );
        // const functions = {
        //     addedFunction: {
        //         name: addedFunction.name,
        //         lines: addedFunction.lines,
        //         fullText: addedFunction.fullText,
        //     },
        //     existingFunctions: existingFunctions.map((func) => ({
        //         name: func.name,
        //         lines: func.lines,
        //         fullText: func.fullText,
        //     })),
        // };

        // TODO: Re-enable LLM-based function similarity when PromptRunnerService is available
        // const result = await this.promptRunnerService
        //     .builder()
        //     .setProviders({
        //         main: LLMModelProvider.NOVITA_DEEPSEEK_V3_0324,
        //         fallback: LLMModelProvider.OPENAI_GPT_4O,
        //     })
        //     .setParser<FunctionSimilar[]>(ParserType.JSON)
        //     .setLLMJsonMode(true)
        //     .setTemperature(0)
        //     .setPayload(JSON.stringify(functions))
        //     .addPrompt({
        //         prompt: promptCheckSimilarFunctionsSystem,
        //         role: PromptRole.SYSTEM,
        //     })
        //     .setRunName('checkFunctionSimilarityWithLLM')
        //     .execute();

        // return result;

        // Temporary mock result - return empty similarity analysis
        this.logger.warn({
            message:
                'Function similarity analysis disabled - PromptRunnerService not available',
            context: 'GraphAnalyzerService.checkFunctionSimilarityWithLLM',
        });

        return [];
    }
}
