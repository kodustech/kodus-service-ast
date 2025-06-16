// Importa os módulos necessários
const os = require('os');

// Configurações base baseadas em porcentagem
const config = {
    appName: 'kodus-service-ast',

    memoryPercentage: 0.7, // 70% da memória disponível
    cpuOffset: 1, // Núcleos a reservar para o SO
    minMemoryMB: 512, // Mínimo absoluto de memória (512MB)
    threadPoolMultiplier: 3, // Threads por núcleo de CPU
    maxThreadPoolSize: 32, // Limite máximo de threads
    memoryBufferPercentage: 0.1, // 10% de buffer de segurança
};

// Calcula os recursos disponíveis
function calculateResources() {
    // Memória total em MB
    const totalMemoryMB = Math.floor(os.totalmem() / (1024 * 1024));

    // Número de CPUs
    const cpuCount = os.cpus().length;

    // Calcula a memória alocada (70% da memória total, com mínimo de 512MB)
    let memoryMB = Math.max(
        config.minMemoryMB,
        Math.floor(totalMemoryMB * config.memoryPercentage),
    );

    // Aplica buffer de segurança (deixa 10% de folga)
    memoryMB = Math.floor(memoryMB * (1 - config.memoryBufferPercentage));

    // Calcula o número de workers (CPUs - offset)
    const workers = Math.max(1, cpuCount - config.cpuOffset);

    // Calcula o tamanho do thread pool
    const threadPoolSize = Math.min(
        config.maxThreadPoolSize,
        Math.max(4, cpuCount * config.threadPoolMultiplier),
    );

    return {
        memoryMB,
        workers,
        threadPoolSize,
        cpuCount,
        totalMemoryMB,
    };
}

const resources = calculateResources();

// Log das configurações
console.log(`
============================================
  Configuração do Serviço: ${config.appName}
  -----------------------------------------
  CPUs: ${resources.cpuCount} (${resources.workers} workers)
  Memória Total: ${Math.round((resources.totalMemoryMB / 1024) * 10) / 10} GB
  Memória Alocada: ${Math.round((resources.memoryMB / 1024) * 10) / 10} GB (${config.memoryPercentage * 100}% com buffer de ${config.memoryBufferPercentage * 100}%)
  Thread Pool: ${resources.threadPoolSize} (${config.threadPoolMultiplier} por núcleo)
  Node.js: ${process.version}
  Plataforma: ${process.platform} ${process.arch}
  Pasta de Trabalho: ${process.cwd()}
  Usuário: ${process.env.USER || 'desconhecido'}
  NODE_ENV: ${process.env.NODE_ENV || 'production'}
============================================
`);

// Configuração do PM2
module.exports = {
    apps: [
        {
            name: config.appName,
            script: './dist/src/main.js',
            instances: resources.workers,
            exec_mode: 'cluster',

            // Configurações de memória
            max_memory_restart: `${Math.floor(resources.memoryMB * 0.9)}M`,
            node_args: [
                `--max-old-space-size=${Math.floor(resources.memoryMB * 0.9)}`,
                '--max-http-header-size=16384',
                '--trace-warnings',
                '--unhandled-rejections=strict',
                '--max-semi-space-size=128',
            ],

            // Controle de ciclo de vida
            listen_timeout: 300000,
            kill_timeout: 30000,
            wait_ready: true,
            shutdown_with_message: true,

            // Logs
            merge_logs: true,
            out_file: '/dev/stdout',
            error_file: '/dev/stderr',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            log_type: 'json',

            // Monitoramento
            min_uptime: '5m',
            max_restarts: 10,
            restart_delay: 5000,

            // Variáveis de ambiente
            env: {
                NODE_ENV: process.env.NODE_ENV || 'production',
                CONTAINER_NAME: config.appName,
                API_PORT: '3002',
                API_HEALTH_PORT: '5001',
                UV_THREADPOOL_SIZE: resources.threadPoolSize.toString(),
                NODE_OPTIONS: '--max-http-header-size=16384 --trace-warnings',
                LOG_LEVEL: process.env.LOG_LEVEL || 'info',
                MAX_WORKERS: resources.workers.toString(),
                CACHE_TTL: '3600',
                TIMEOUT: '300000',
            },
        },
    ],
};
