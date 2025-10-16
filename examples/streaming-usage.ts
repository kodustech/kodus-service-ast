/**
 * Exemplo de uso do AsyncGenerator para streaming de processamento de arquivos
 * Demonstra como usar o novo sistema de streaming implementado
 */

import { CodeKnowledgeGraphService } from '../src/core/infrastructure/adapters/services/parsing/code-knowledge-graph.service.js';

/**
 * Exemplo 1: Processamento básico com streaming
 */
async function basicStreamingExample() {
    const service = new CodeKnowledgeGraphService(null as any);

    try {
        // Usar o novo método de streaming
        const result = await service.buildGraphStreaming('/path/to/repo', []);

        console.log(`✅ Processamento concluído!`);
        console.log(`📁 Arquivos processados: ${result.files.size}`);
        console.log(`🔧 Funções encontradas: ${result.functions.size}`);
        console.log(`🏷️  Tipos encontrados: ${result.types.size}`);
    } catch (error) {
        console.error('❌ Erro no processamento:', error);
    }
}

/**
 * Exemplo 2: Streaming com controle granular usando AsyncGenerator
 */
async function advancedStreamingExample() {
    const service = new CodeKnowledgeGraphService(null as any);

    try {
        // Obter lista de arquivos
        const sourceFiles = await service.getAllSourceFiles('/path/to/repo');
        const filesToProcess = sourceFiles.slice(0, 100); // Processar apenas 100 arquivos

        console.log(
            `🚀 Iniciando processamento streaming de ${filesToProcess.length} arquivos...`,
        );

        // Processar com controle granular
        for await (const batchProgress of service.processFilesInBatches(
            filesToProcess,
            '/path/to/repo',
        )) {
            const { batch, progress, processedFiles, totalFiles, batchIndex } =
                batchProgress;

            // Mostrar progresso em tempo real
            console.log(
                `📊 Progresso: ${progress.toFixed(2)}% (${processedFiles}/${totalFiles})`,
            );
            console.log(
                `📦 Lote ${batchIndex}: ${batch.files.length} arquivos processados`,
            );

            // Processar resultados do lote atual
            for (const file of batch.files) {
                console.log(
                    `  📄 ${file.filePath}: ${file.analysis.fileAnalysis.defines.length} definições`,
                );
            }

            // Verificar erros
            if (batch.errors.length > 0) {
                console.warn(`⚠️  Erros no lote ${batchIndex}:`, batch.errors);
            }

            // Obter métricas em tempo real
            const metrics = service.getStreamingMetrics();
            console.log(
                `⚡ Performance: ${metrics.filesPerSecond.toFixed(2)} arquivos/seg`,
            );
            console.log(
                `🧠 Memória: ${(metrics.memoryUsage * 100).toFixed(1)}%`,
            );

            // Pausar se necessário (exemplo: para evitar sobrecarga)
            if (metrics.memoryUsage > 0.8) {
                console.log('⏸️  Pausando devido ao alto uso de memória...');
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        console.log('✅ Processamento streaming concluído!');
    } catch (error) {
        console.error('❌ Erro no processamento streaming:', error);
    }
}

/**
 * Exemplo 3: Comparação de performance entre métodos
 */
async function performanceComparisonExample() {
    const service = new CodeKnowledgeGraphService(null as any);
    const testFiles = await service.getAllSourceFiles('/path/to/repo');

    console.log('🔬 Comparação de Performance');
    console.log('============================');

    // Método tradicional
    console.log('\n📊 Método tradicional (buildGraphProgressively)...');
    const traditionalStart = performance.now();
    try {
        await service.buildGraphProgressively('/path/to/repo', []);
        const traditionalTime = performance.now() - traditionalStart;
        console.log(`⏱️  Tempo tradicional: ${traditionalTime.toFixed(2)}ms`);
    } catch (error) {
        console.error('❌ Erro no método tradicional:', error);
    }

    // Método streaming
    console.log('\n📊 Método streaming (buildGraphStreaming)...');
    service.resetStreamingMetrics(); // Resetar métricas
    const streamingStart = performance.now();
    try {
        await service.buildGraphStreaming('/path/to/repo', []);
        const streamingTime = performance.now() - streamingStart;
        console.log(`⏱️  Tempo streaming: ${streamingTime.toFixed(2)}ms`);

        // Mostrar métricas detalhadas
        const metrics = service.getStreamingMetrics();
        console.log(`📈 Métricas detalhadas:`);
        console.log(
            `  - Arquivos/segundo: ${metrics.filesPerSecond.toFixed(2)}`,
        );
        console.log(
            `  - Tempo médio por arquivo: ${metrics.averageProcessingTime.toFixed(2)}ms`,
        );
        console.log(
            `  - Pico de uso de memória: ${(metrics.memoryUsage * 100).toFixed(1)}%`,
        );
    } catch (error) {
        console.error('❌ Erro no método streaming:', error);
    }
}

/**
 * Exemplo 4: Uso em produção com monitoramento
 */
async function productionMonitoringExample() {
    const service = new CodeKnowledgeGraphService(null as any);

    // Simular processamento contínuo
    const repositories = ['/repo1', '/repo2', '/repo3'];

    for (const repoPath of repositories) {
        console.log(`\n🔄 Processando repositório: ${repoPath}`);

        try {
            // Processar com streaming
            for await (const batchProgress of service.processFilesInBatches(
                await service.getAllSourceFiles(repoPath),
                repoPath,
            )) {
                // Em produção, você poderia:
                // - Salvar progresso no banco de dados
                // - Enviar métricas para sistemas de monitoramento
                // - Notificar outros serviços sobre o progresso

                console.log(
                    `📊 ${repoPath}: ${batchProgress.progress.toFixed(1)}%`,
                );

                // Verificar se deve parar (exemplo: sinal de shutdown)
                if (process.env.SHUTDOWN_SIGNAL === 'true') {
                    console.log(
                        '🛑 Sinal de shutdown recebido, parando processamento...',
                    );
                    break;
                }
            }

            console.log(`✅ ${repoPath} processado com sucesso!`);
        } catch (error) {
            console.error(`❌ Erro ao processar ${repoPath}:`, error);
            // Em produção, registrar erro e continuar com próximo repositório
        }
    }

    // Mostrar métricas finais
    const finalMetrics = service.getStreamingMetrics();
    console.log('\n📊 Métricas finais:');
    console.log(
        `  - Total de arquivos processados: ${finalMetrics.filesProcessed}`,
    );
    console.log(`  - Tempo total: ${(finalMetrics.uptime / 1000).toFixed(2)}s`);
    console.log(
        `  - Throughput médio: ${finalMetrics.filesPerSecond.toFixed(2)} arquivos/seg`,
    );
}

// Exportar exemplos para uso
export {
    basicStreamingExample,
    advancedStreamingExample,
    performanceComparisonExample,
    productionMonitoringExample,
};

// Exemplo de uso se executado diretamente
if (require.main === module) {
    console.log('🚀 Executando exemplos de streaming...\n');

    // Executar exemplo básico
    basicStreamingExample()
        .then(() => console.log('\n✅ Exemplo básico concluído\n'))
        .catch(console.error);
}
