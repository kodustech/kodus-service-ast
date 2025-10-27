// Configuração PM2 Otimizada - Single Instance
// Resolve o problema de task sharing entre instâncias
// Otimizada para AST parsing de base de código inteira
// Máquina: n2d-standard-4 (4 vCPUs, 16 GB RAM)

module.exports = {
    apps: [
        {
            name: 'kodus-service-ast',
            script: './dist/src/main.js',

            // SINGLE INSTANCE - Resolve problema de task sharing
            instances: 1,
            exec_mode: 'fork',

            // Configurações otimizadas para n2d-standard-4 (16 GB RAM)
            max_memory_restart: '12G', // 75% da RAM disponível
            node_args: [
                // Memória heap otimizada para 16 GB RAM
                '--max-old-space-size=12288', // 12GB (75% da RAM)
                '--max-semi-space-size=1024', // 1GB para objetos temporários

                // Event loop e performance
                '--max-http-header-size=16384',
                '--trace-warnings',
                '--unhandled-rejections=strict',

                // 🚀 OTIMIZAÇÃO: Habilitar garbage collection manual
                '--expose-gc',
                '--optimize-for-size',
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
