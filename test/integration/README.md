# Testes de Integração - NestJS Modules

Este documento explica como usar os módulos do NestJS para testes de integração.

## Estrutura Básica de Teste

### 1. Importações Necessárias

```typescript
import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import * as request from 'supertest';
```

### 2. Configuração Básica

```typescript
describe('My Integration Test', () => {
    let app: INestApplication;
    let moduleFixture: TestingModule;

    beforeAll(async () => {
        // Criar TestingModule
        moduleFixture = await Test.createTestingModule({
            imports: [
                /* módulos a testar */
            ],
            controllers: [
                /* controllers a testar */
            ],
            providers: [
                /* providers a testar */
            ],
        }).compile();

        // Criar aplicação
        app = moduleFixture.createNestApplication();

        // Inicializar (opcional para testes HTTP)
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });
});
```

## Padrões de Teste

### TestingModule Creation

```typescript
describe('TestingModule Creation', () => {
    it('should create a testing module', () => {
        expect(moduleFixture).toBeDefined();
        expect(typeof moduleFixture.get).toBe('function';
    });

    it('should access providers', () => {
        const service = moduleFixture.get(MyService);
        expect(service).toBeDefined();
    });
});
```

### Provider Override

```typescript
describe('Provider Overrides', () => {
    it('should override with useValue', async () => {
        const testModule = await Test.createTestingModule({
            providers: [{ provide: 'Service', useValue: mockService }],
        })
            .overrideProvider('Service')
            .useValue(overriddenMock)
            .compile();

        const service = testModule.get('Service');
        expect(service.getData()).toBe('overridden');
    });

    it('should override with useClass', async () => {
        class MockService {
            getValue() {
                return 'mocked';
            }
        }

        const testModule = await Test.createTestingModule({
            providers: [{ provide: 'Service', useClass: MockService }],
        }).compile();

        const service = testModule.get('Service');
        expect(service.getValue()).toBe('mocked');
    });
});
```

### HTTP Testing (@Web)

```typescript
describe('HTTP Endpoints', () => {
    it('should return data', async () => {
        const response = await request(app.getHttpServer())
            .get('/endpoint')
            .expect(200);

        expect(response.body).toHaveProperty('data');
    });

    it('should handle POST requests', async () => {
        const response = await request(app.getHttpServer())
            .post('/endpoint')
            .send({ name: 'test' })
            .expect(201);

        expect(response.body).toHaveProperty('id');
    });
});
```

## Exemplo Completo

O arquivo `nestjs-basics.spec.ts` demonstra:

1. **Criação de TestingModule** - Como criar módulos de teste
2. **Criação de Aplicação** - Como criar apps NestJS para teste
3. **Override de Providers** - Como mockar dependências
4. **Padrões HTTP** - Como testar endpoints

## Comandos Disponíveis

```bash
# Executar apenas testes NestJS
yarn test:nestjs

# Executar apenas testes de messaging (RabbitMQ)
yarn test:messaging

# Executar todos os testes
yarn test
```

## Dicas Importantes

### 1. Módulos Isolados

- Teste apenas o módulo necessário
- Evite importar `AppModule` completo para evitar dependências complexas

### 2. Mocks Inteligentes

- Use `overrideProvider` para mockar dependências
- Crie classes/classes mock específicas para testes

### 3. Setup/Teardown

- Use `beforeAll` para setup caro
- Use `beforeEach` para reset de estado
- Sempre faça cleanup em `afterAll`

### 4. HTTP Testing

- Use `request(app.getHttpServer())` para testes HTTP
- Sempre verifique status codes com `.expect()`
- Teste tanto sucesso quanto erro

## Troubleshooting

### TestingModule não compila

- Verifique imports de módulos
- Certifique-se que dependências existem
- Use aliases `@/` corretamente

### Aplicação não inicializa

- Comentário `await app.init()` se não precisar de HTTP
- Verifique se portas não estão ocupadas

### Providers não encontrados

- Verifique se provider está registrado no módulo
- Use `moduleFixture.get(ProviderToken)` corretamente

### HTTP tests falham

- Certifique-se que `app.init()` foi chamado
- Verifique se controller está registrado
- Use `app.getHttpServer()` para supertest
