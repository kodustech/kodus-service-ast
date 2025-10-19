# Kodus AST Service

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.14.0-brightgreen.svg)](https://nodejs.org/)
[![Docker Pulls](https://img.shields.io/docker/pulls/kodustech/kodus-ast.svg)](https://hub.docker.com/r/kodustech/kodus-ast)

A high-performance microservice for source code analysis, generating Abstract Syntax Trees (ASTs) and relationship maps from codebases.

## ✨ Features

- 🚀 AST generation for multiple programming languages
- 🔍 Code relationship mapping
- ⚡ High-performance processing with Node.js worker threads
- 🐳 Docker and Kubernetes ready
- 📊 Built-in health checks and metrics
- 🔒 Secure by default

## 🚀 Getting Started

### Prerequisites

- Node.js 22.14.0 or higher
- Yarn (recommended) or npm
- Docker (for containerized deployment)
- Git

### Installation

1. **Clone the repository**

    ```bash
    git clone https://github.com/kodustech/kodus-service-ast.git
    cd kodus-service-ast
    ```

2. **Install dependencies**
    ```bash
    yarn install
    # or
    npm install
    ```

## 🛠️ Development

### Running Locally

```bash
# Development with hot-reload
yarn start:dev

# Build for production
yarn build

# Run in production mode locally
yarn start:prod
```

## 🐰 RabbitMQ Troubleshooting

### Queue Declaration Conflicts (Error 406 PRECONDITION_FAILED)

If you encounter RabbitMQ errors like "PRECONDITION_FAILED - inequivalent arg", it means queues are being declared with different arguments by different processes.

**Solution:**

1. Stop all applications (API + Worker)
2. Run the cleanup script: `./scripts/cleanup-rabbitmq.sh`
3. Restart applications - queues will be recreated with correct configuration

This happens when:

- API and Worker modules declare the same queue with different `arguments`
- Previous deployments created queues with different configurations
- `@RabbitSubscribe` decorators conflict with module-level queue declarations

## 🐳 Docker

### Build Images

```bash
# Development
make dev-build
# or
docker build -t kodus-ast:dev -f DockerFiles/Dockerfile.dev .

# Production (replace x.y.z with the release version)
docker build \
  --build-arg RELEASE_VERSION=x.y.z \
  -t kodus-ast:x.y.z \
  -f DockerFiles/Dockerfile.prod .
```

### Run Containers

```bash
# Development
docker run -d \
  --name kodus-ast-dev \
  -p 3002:3002 \
  -v $(pwd):/usr/src/app \
  -v /usr/src/app/node_modules \
  kodus-ast:dev

# Production (replace x.y.z with the desired version)
docker run -d \
  --name kodus-ast \
  -p 3002:3002 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  --memory="4g" \
  --cpus="2" \
  kodus-ast:x.y.z
```

## 🌐 API Reference

### Health Check

```
GET /health
```

### API Endpoints

```
POST   /api/analyze     # Analyze source code
GET    /api/status/:id  # Check analysis status
# Other endpoints...
```

> Note: All API routes except `/health` are prefixed with `/api/`

## ⚙️ Configuration

### Environment Variables

| Variable                        | Default        | Description                                                                         |
| ------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `NODE_ENV`                      | production     | Runtime environment                                                                 |
| `LOG_LEVEL`                     | info           | Log level (error, warn, info, debug)                                                |
| `API_PORT`                      | 3002           | API port                                                                            |
| `UV_THREADPOOL_SIZE`            | Auto           | Node.js thread pool size                                                            |
| `DB_URL`                        | -              | Postgres connection string (takes precedence over host/port vars)                   |
| `DB_HOST`                       | localhost      | Postgres host (used when `DB_URL` is not set)                                       |
| `DB_PORT`                       | 5432           | Postgres port                                                                       |
| `DB_USER`                       | -              | Postgres username                                                                   |
| `DB_PASSWORD`                   | -              | Postgres password                                                                   |
| `DB_NAME`                       | -              | Postgres database                                                                   |
| `DB_SCHEMA`                     | kodus_workflow | Schema dedicated a armazenar workflows/tarefas compartilhados                       |
| `DB_SSL`                        | true           | Enables TLS (set `false` only in trusted local setups)                              |
| `DB_SSL_REJECT_UNAUTHORIZED`    | true           | Reject self-signed/invalid certs (set `false` apenas se tiver CA interna conhecida) |
| `DB_POOL_MAX`                   | 10             | Máximo de conexões simultâneas no pool                                              |
| `DB_POOL_IDLE_TIMEOUT_MS`       | 30000          | Tempo para fechar conexões ociosas (ms)                                             |
| `DB_POOL_CONNECTION_TIMEOUT_MS` | 5000           | Timeout para adquirir conexão (ms)                                                  |
| `DB_STATEMENT_TIMEOUT_MS`       | 0              | Timeout por query (ms). 0 = ilimitado                                               |
| `API_DATABASE_ENV`              | production     | Define se estamos em `development`/`local` (desativa TLS por padrão)                |

> Os campos `DB_*` também aceitam as variáveis utilizadas pelos demais serviços (`API_PG_DB_HOST`, `API_PG_DB_USERNAME`, etc.) como fallback.

> Observação: o serviço inicializa automaticamente o schema/tabelas (com `CREATE IF NOT EXISTS`) na primeira execução. Para ambientes gerenciados, execute as DDLs do diretório `docs/architecture` antes do deploy.

## 🧪 Testing

```bash
# Run all tests
yarn test

# Run tests with coverage
yarn test:cov

# Run e2e tests
yarn test:e2e
```

## 🚀 Deployment

O deploy pode ser feito via pipelines CI/CD (GitHub Actions, Jenkins, etc.), gerando imagem container e aplicando-a na infraestrutura escolhida (ECS, Kubernetes, VMs, etc.).

### Production Deployment

```bash
# Build and push the production image
make release VERSION=x.y.z

# Deploy to your infrastructure
kubectl apply -f k8s/
```

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📚 Documentation

For more detailed documentation, please refer to our [documentation site](https://docs.kodus.tech/ast-service).

## 📬 Contact

Project Link: [https://github.com/kodustech/kodus-service-ast](https://github.com/kodustech/kodus-service-ast)

## 🙏 Acknowledgments

- Built with ❤️ by the Kodus Tech Team
- Thanks to all contributors who have helped shape this project
- Inspired by modern AST tooling and code analysis tools
