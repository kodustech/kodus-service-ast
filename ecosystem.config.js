module.exports = {
    apps: [
        {
            name: 'kodus-service-ast',
            script: './dist/src/main.js',
            // Configurações de log otimizadas
            out_file: '/app/logs/kodus-service-ast/out.log',
            error_file: '/app/logs/kodus-service-ast/error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            combine_logs: true,
            instances: 'max',
            exec_mode: 'cluster',
            kill_timeout: 3000, // Tempo para encerrar graciosamente
            wait_ready: true, // Esperar sinal 'ready' da aplicação
            listen_timeout: 30000, // Tempo para considerar aplicação pronta
            env: {
                NODE_ENV: 'production',
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
