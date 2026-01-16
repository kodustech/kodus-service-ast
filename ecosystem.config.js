// Configuração PM2 Otimizada - Single Instance
// Resolve o problema de task sharing entre instâncias
// Otimizada para AST parsing de base de código inteira
// Máquina: n2d-standard-4 (4 vCPUs, 16 GB RAM)

module.exports = {
    apps: [
        {
            name: 'kodus-service-ast',
            script: './dist/main.js',

            // SINGLE INSTANCE - Resolve problema de task sharing
            instances: 1,
            exec_mode: 'fork',

            node_args: [
                '--max-http-header-size=16384',
                '--trace-warnings',
                '--unhandled-rejections=strict',
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
        },
    ],
};
