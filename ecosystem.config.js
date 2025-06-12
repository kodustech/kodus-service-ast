module.exports = {
    apps: [
        {
            name: 'kodus-service-ast',
            script: './dist/src/main.js',
            instances: 'max', // 1 por vCPU
            exec_mode: 'cluster',
            wait_ready: true, // PM2 aguarda mensagem 'ready'
            listen_timeout: 30000, // se não receber 'ready' em 30 s → restart
            kill_timeout: 3000, // tempo para workers fecharem
            shutdown_with_message: true, // envia mensagem 'shutdown' aos workers
            merge_logs: true,

            out_file: '/dev/stdout',
            error_file: '/dev/stderr',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

            env: {
                NODE_ENV: 'production',
                CONTAINER_NAME: 'kodus-service-ast',
                API_PORT: '3002',
                API_HEALTH_PORT: '5001',
            },
        },
    ],
};
