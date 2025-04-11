module.exports = {
    apps: [
        {
            name: 'kodus-ast',
            script: './dist/main.js',
            out_file: '/app/logs/kodus-ast/out.log',
            error_file: '/app/logs/kodus-ast/error.log',
            env_homolog: {
                API_NODE_ENV: 'homolog',
            },
            env_production: {
                API_NODE_ENV: 'production',
            },
        },
    ],
};
