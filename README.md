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
  -p 5001:5001 \
  -v $(pwd):/usr/src/app \
  -v /usr/src/app/node_modules \
  kodus-ast:dev

# Production (replace x.y.z with the desired version)
docker run -d \
  --name kodus-ast \
  -p 3002:3002 \
  -p 5001:5001 \
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

| Variable           | Default    | Description                               |
|--------------------|------------|-------------------------------------------|
| `NODE_ENV`         | production | Runtime environment                       |
| `LOG_LEVEL`        | info       | Log level (error, warn, info, debug)      |
| `API_PORT`         | 3002       | API port                                 |
| `API_HEALTH_PORT`  | 5001       | Health check port                        |
| `UV_THREADPOOL_SIZE`| Auto      | Node.js thread pool size                 |

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

Deployment is automated via GitHub Actions to GCP. The service is designed to be deployed in a containerized environment.

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
