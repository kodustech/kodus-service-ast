module.exports = {
    apps: [
        {
            name: 'kodus-service-ast',
            script: './dist/main.js',
            // Configurações de log otimizadas
            out_file: '/app/logs/kodus-service-ast/out.log',
            error_file: '/app/logs/kodus-service-ast/error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            combine_logs: true,
            // Configurações de performance
            instances: 'max', // Usar todos os CPUs disponíveis
            exec_mode: 'cluster', // Modo cluster para melhor throughput
            max_memory_restart: '4G', // Reiniciar se passar de 4GB de memória
            kill_timeout: 3000, // Tempo para encerrar graciosamente
            wait_ready: true, // Esperar sinal 'ready' da aplicação
            listen_timeout: 30000, // Tempo para considerar aplicação pronta
            // Configurações de ambiente
            env: {
                NODE_ENV: 'production',
                NODE_OPTIONS: '--max-old-space-size=4096',
            },
            env_homolog: {
                API_NODE_ENV: 'homolog',
            },
            env_production: {
                API_NODE_ENV: 'production',
            },
        },
    ],
};
