module.exports = {
    apps: [
        {
            name: 'kodus-service-ast',
            script: './dist/main.js',
            out_file: '/app/logs/kodus-service-ast/out.log',
            error_file: '/app/logs/kodus-service-ast/error.log',
            env_homolog: {
                API_NODE_ENV: 'homolog',
            },
            env_production: {
                API_NODE_ENV: 'production',
            },
        },
    ],
};
