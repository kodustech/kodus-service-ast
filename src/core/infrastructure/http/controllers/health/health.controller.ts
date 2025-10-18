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

    /**
     * 🚀 NOVO: Monitor de recursos em tempo real
     * Mostra CPU, RAM e recomendações de escalonamento
     */
    @Get('resources')
    getResourceMetrics() {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        const uptime = process.uptime();

        // Calcular uso de CPU em porcentagem
        const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // microsegundos para segundos
        const cpuPercentPerCore = cpuPercent / os.cpus().length;

        // Calcular uso de memória em MB
        const memoryMB = {
            rss: Math.round(memoryUsage.rss / 1024 / 1024),
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            external: Math.round(memoryUsage.external / 1024 / 1024),
        };

        // Sistema
        const systemInfo = {
            cpus: os.cpus().length,
            totalMem: Math.round(os.totalmem() / 1024 / 1024),
            freeMem: Math.round(os.freemem() / 1024 / 1024),
            loadAvg: os.loadavg().map((load) => load.toFixed(2)),
        };

        // Status baseado no uso
        const memoryUsagePercent = (memoryMB.rss / systemInfo.totalMem) * 100;
        const memoryStatus =
            memoryUsagePercent > 80
                ? '🔴 CRÍTICO'
                : memoryUsagePercent > 60
                  ? '🟡 ALTO'
                  : '🟢 OK';

        const cpuStatus =
            cpuPercentPerCore > 80
                ? '🔴 CRÍTICO'
                : cpuPercentPerCore > 60
                  ? '🟡 ALTO'
                  : '🟢 OK';

        // Recomendações de escalonamento
        const recommendedWorkers = Math.ceil(memoryMB.rss / 1000); // 1 worker por 1GB
        const maxWorkers = systemInfo.cpus * 2;
        const finalWorkers = Math.min(
            Math.max(recommendedWorkers, 1),
            maxWorkers,
        );

        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'kodus-service-ast',
            environment: process.env.NODE_ENV || 'development',

            process: {
                pid: process.pid,
                uptime: `${uptime.toFixed(1)}s`,
                platform: process.platform,
                nodeVersion: process.version,
            },

            resources: {
                memory: {
                    rss: `${memoryMB.rss}MB`,
                    heapUsed: `${memoryMB.heapUsed}MB`,
                    heapTotal: `${memoryMB.heapTotal}MB`,
                    external: `${memoryMB.external}MB`,
                    usagePercent: `${memoryUsagePercent.toFixed(1)}%`,
                    status: memoryStatus,
                },
                cpu: {
                    user: `${(cpuUsage.user / 1000000).toFixed(2)}s`,
                    system: `${(cpuUsage.system / 1000000).toFixed(2)}s`,
                    total: `${cpuPercent.toFixed(2)}s`,
                    percentPerCore: `${cpuPercentPerCore.toFixed(1)}%`,
                    status: cpuStatus,
                },
            },

            system: {
                cpus: systemInfo.cpus,
                totalMem: `${systemInfo.totalMem}MB`,
                freeMem: `${systemInfo.freeMem}MB`,
                loadAvg: systemInfo.loadAvg,
            },

            scaling: {
                recommendedWorkers: finalWorkers,
                workersRange: `1-${maxWorkers}`,
                memoryPerWorker: `${Math.ceil(memoryMB.rss * 1.5)}MB`,
                totalMemoryNeeded: `${Math.ceil(memoryMB.rss * 1.5 * finalWorkers)}MB`,
                recommendations: {
                    current:
                        memoryUsagePercent > 80 || cpuPercentPerCore > 80
                            ? '🔴 AÇÃO IMEDIATA: Aumentar recursos ou otimizar'
                            : memoryUsagePercent > 60 || cpuPercentPerCore > 60
                              ? '🟡 MONITORAR: Considerar mais workers'
                              : '🟢 ESTÁVEL: Recursos adequados',
                    workers:
                        finalWorkers > 1
                            ? `💡 Considerar ${finalWorkers} workers para melhor performance`
                            : '✅ 1 worker suficiente para carga atual',
                },
            },
        };
    }
}
