import * as os from 'os';
import { Controller, Get } from '@nestjs/common';
import { HealthCheckService } from '@nestjs/terminus';
import { HealthService } from '../../../../domain/health/health.service.js';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/parsing/code-knowledge-graph.service.js';

/**
 * Controller responsável por verificar a saúde da aplicação
 * Fornece endpoints leves e detalhados para monitoramento
 */
@Controller('health')
export class HealthController {
    constructor(
        private readonly healthService: HealthService,
        private readonly health: HealthCheckService,
        private readonly codeKnowledgeGraphService: CodeKnowledgeGraphService,
    ) {}

    /**
     * Endpoint básico de verificação de saúde para balanceadores de carga
     * Projetado para ser leve com sobrecarga mínima
     * Adequado para polling frequente por ELB
     */
    @Get()
    checkLiveness(): {
        status: string;
        timestamp: string;
        service: string;
        environment: string;
    } {
        return {
            ...this.healthService.checkLiveness(),
            timestamp: new Date().toISOString(),
            service: 'kodus-service-ast',
            environment: process.env.NODE_ENV || 'development',
        };
    }

    /**
     * Verificação de saúde detalhada com métricas do sistema
     * Para diagnóstico e monitoramento menos frequente
     * Fornece uso de memória e outras informações do sistema
     */
    @Get('detail')
    checkReadiness() {
        const memoryUsage = process.memoryUsage();
        const memoryUsageMB = Object.entries(memoryUsage).reduce(
            (acc, [key, value]) => {
                acc[key] =
                    `${Math.round((value / 1024 / 1024) * 100) / 100} MB`;
                return acc;
            },
            {} as Record<string, string>,
        );

        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'kodus-service-ast',
            environment: process.env.NODE_ENV || 'development',
            memory: memoryUsageMB,
            resources: {
                cpus: os.cpus().length,
                freemem: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
                totalmem: `${Math.round(os.totalmem() / 1024 / 1024)} MB`,
                loadavg: os.loadavg().map((load) => load.toFixed(2)),
            },
        };
    }

    /**
     * Endpoint para métricas de streaming do processamento de arquivos
     * Mostra performance em tempo real do AsyncGenerator
     */
    @Get('streaming-metrics')
    getStreamingMetrics() {
        const streamingMetrics =
            this.codeKnowledgeGraphService.getStreamingMetrics();
        const memoryUsage = process.memoryUsage();

        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'kodus-service-ast',
            environment: process.env.NODE_ENV || 'development',
            streaming: {
                ...streamingMetrics,
                memoryUsage: {
                    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
                    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
                    heapRatio: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(2)}%`,
                },
                performance: {
                    filesPerSecond: streamingMetrics.filesPerSecond.toFixed(2),
                    averageProcessingTime: `${streamingMetrics.averageProcessingTime.toFixed(2)} ms`,
                    uptime: `${(streamingMetrics.uptime / 1000).toFixed(2)}s`,
                },
            },
        };
    }
}
