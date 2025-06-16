import * as os from 'os';
import { Controller, Get } from '@nestjs/common';
import { HealthService } from '../../../../domain/health/health.service';

/**
 * Controller responsável por verificar a saúde da aplicação
 * Fornece endpoints leves e detalhados para monitoramento
 */
@Controller('health')
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

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
}
