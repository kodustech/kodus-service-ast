// Teste Completo: Como Testar Módulos, Services e Controllers do NestJS
// Este arquivo demonstra TODAS as técnicas de teste do NestJS em um único lugar
// Usando apenas exemplos mockados para evitar dependências complexas

import { Test, type TestingModule } from '@nestjs/testing';
import {
    type INestApplication,
    Injectable,
    Controller,
    Get,
    Module,
    Inject,
} from '@nestjs/common';
import request from 'supertest';

// Tokens de injeção para dependências
const DEPENDENCY_1 = 'DEPENDENCY_1';
const DEPENDENCY_2 = 'DEPENDENCY_2';

// Classes de exemplo para demonstração
@Injectable()
class ExampleService {
    constructor(
        @Inject(DEPENDENCY_1) private readonly dependency1: any,
        @Inject(DEPENDENCY_2) private readonly dependency2: any,
    ) {}

    async processData(data: string): Promise<string> {
        await this.dependency1.validate(data);
        const result = await this.dependency2.transform(data);
        return result;
    }
}

@Injectable()
class HealthService {
    checkLiveness() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'test-service',
            environment: 'test',
        };
    }
}

@Controller('health')
class HealthController {
    constructor(private readonly healthService: HealthService) {}

    @Get()
    checkLiveness() {
        return this.healthService.checkLiveness();
    }

    @Get('detail')
    checkDetail() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            memory: { rss: '10 MB', heapTotal: '20 MB', heapUsed: '15 MB' },
            resources: { cpus: 4, freemem: '2 GB', totalmem: '8 GB' },
        };
    }
}

@Module({
    controllers: [HealthController],
    providers: [HealthService],
    exports: [HealthService],
})
class HealthModule {}

describe('NestJS Testing Complete Guide', () => {
    describe('1. Service Testing (Unit)', () => {
        let service: ExampleService;
        let mockDependency1: any;
        let mockDependency2: any;

        beforeEach(async () => {
            // Setup: Criar mocks para dependências
            mockDependency1 = {
                validate: jest.fn().mockResolvedValue(true),
            };

            mockDependency2 = {
                transform: jest.fn().mockResolvedValue('PROCESSED_DATA'),
            };

            // Criar TestingModule apenas com o service e suas dependências mockadas
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    ExampleService,
                    {
                        provide: DEPENDENCY_1,
                        useValue: mockDependency1,
                    },
                    {
                        provide: DEPENDENCY_2,
                        useValue: mockDependency2,
                    },
                ],
            }).compile();

            service = module.get<ExampleService>(ExampleService);
        });

        it('should process data successfully', async () => {
            const result = await service.processData('input data');

            expect(result).toBe('PROCESSED_DATA');
            expect(mockDependency1.validate).toHaveBeenCalledWith('input data');
            expect(mockDependency2.transform).toHaveBeenCalledWith(
                'input data',
            );
        });

        it('should handle errors gracefully', async () => {
            mockDependency1.validate.mockRejectedValue(
                new Error('Validation failed'),
            );

            await expect(service.processData('bad data')).rejects.toThrow(
                'Validation failed',
            );

            expect(mockDependency1.validate).toHaveBeenCalledWith('bad data');
            expect(mockDependency2.transform).not.toHaveBeenCalled();
        });
    });

    describe('2. Controller Testing (Integration)', () => {
        let app: INestApplication;
        let healthService: jest.Mocked<HealthService>;

        beforeAll(async () => {
            // Criar TestingModule com controller e suas dependências
            const moduleFixture: TestingModule = await Test.createTestingModule(
                {
                    controllers: [HealthController],
                    providers: [
                        {
                            provide: HealthService,
                            useValue: {
                                checkLiveness: jest.fn().mockReturnValue({
                                    status: 'ok',
                                    timestamp: new Date().toISOString(),
                                    service: 'test-service',
                                    environment: 'test',
                                }),
                            },
                        },
                    ],
                },
            ).compile();

            app = moduleFixture.createNestApplication();
            healthService =
                moduleFixture.get<jest.Mocked<HealthService>>(HealthService);

            await app.init();
        });

        beforeEach(() => {
            jest.clearAllMocks();
        });

        afterAll(async () => {
            await app.close();
        });

        it('should respond to GET /health', async () => {
            const response = await request(app.getHttpServer())
                .get('/health')
                .expect(200);

            expect(response.body).toEqual({
                status: 'ok',
                timestamp: expect.any(String),
                service: 'test-service',
                environment: 'test',
            });
        });

        it('should call service method', async () => {
            // Spy on the service method to count calls
            const spy = jest.spyOn(healthService, 'checkLiveness');

            await request(app.getHttpServer()).get('/health');

            expect(spy).toHaveBeenCalledTimes(1);
        });

        it('should handle different response formats', async () => {
            // Override do service para este teste específico
            jest.spyOn(healthService, 'checkLiveness').mockReturnValueOnce({
                status: 'error',
                message: 'Service unavailable',
            } as any);

            const response = await request(app.getHttpServer())
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('error');
            expect(response.body.message).toBe('Service unavailable');
        });
    });

    describe('3. Module Testing (Integration)', () => {
        let app: INestApplication;
        let moduleFixture: TestingModule;
        let healthService: jest.Mocked<HealthService>;

        beforeAll(async () => {
            // Testar módulo completo
            moduleFixture = await Test.createTestingModule({
                imports: [HealthModule],
            })
                // Override de provider no nível do módulo
                .overrideProvider(HealthService)
                .useValue({
                    checkLiveness: jest.fn().mockReturnValue({
                        status: 'module-test',
                        timestamp: new Date().toISOString(),
                        service: 'module-service',
                        environment: 'module-test',
                    }),
                })
                .compile();

            app = moduleFixture.createNestApplication();
            healthService =
                moduleFixture.get<jest.Mocked<HealthService>>(HealthService);

            await app.init();
        });

        afterAll(async () => {
            await app.close();
        });

        it('should load complete module', () => {
            expect(moduleFixture).toBeDefined();
            expect(healthService).toBeDefined();
        });

        it('should expose module endpoints', async () => {
            const response = await request(app.getHttpServer())
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('module-test');
            expect(response.body.service).toBe('module-service');
        });

        it('should support multiple endpoints from module', async () => {
            // Testar /health/detail se existir
            const response = await request(app.getHttpServer())
                .get('/health/detail')
                .expect(200);

            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('memory');
        });
    });

    describe('4. Advanced Testing Patterns', () => {
        it('should demonstrate provider override patterns', async () => {
            // Padrão 1: useValue para objetos mock
            const mockService = {
                getData: jest.fn().mockReturnValue('mocked'),
            };

            const module1 = await Test.createTestingModule({
                providers: [
                    {
                        provide: 'TestService',
                        useValue: mockService,
                    },
                ],
            }).compile();

            const service1 = module1.get('TestService');
            expect(service1.getData()).toBe('mocked');

            // Padrão 2: useClass para classes mock
            class MockClass {
                getData() {
                    return 'class mock';
                }
            }

            const module2 = await Test.createTestingModule({
                providers: [
                    {
                        provide: 'TestService',
                        useClass: MockClass,
                    },
                ],
            }).compile();

            const service2 = module2.get('TestService');
            expect(service2.getData()).toBe('class mock');

            // Padrão 3: overrideProvider para substituir
            const module3 = await Test.createTestingModule({
                providers: [
                    {
                        provide: 'TestService',
                        useValue: { getData: () => 'original' },
                    },
                ],
            })
                .overrideProvider('TestService')
                .useValue({ getData: () => 'overridden' })
                .compile();

            const service3 = module3.get('TestService');
            expect(service3.getData()).toBe('overridden');
        });

        it('should demonstrate e2e testing setup', async () => {
            // Setup para teste e2e (end-to-end)
            const e2eModule = await Test.createTestingModule({
                imports: [HealthModule], // Módulos reais da aplicação
            }).compile();

            const e2eApp = e2eModule.createNestApplication();

            // Configurar app como em produção
            // e2eApp.setGlobalPrefix('api');
            // e2eApp.useGlobalPipes(new ValidationPipe());
            // etc.

            await e2eApp.init();

            try {
                // Teste e2e real
                const response = await request(e2eApp.getHttpServer())
                    .get('/health')
                    .expect(200);

                expect(response.body).toHaveProperty('status');
            } finally {
                await e2eApp.close();
            }
        });

        it('should demonstrate testing utilities', () => {
            // Jest matchers customizados
            expect([1, 2, 3]).toContain(2);
            expect({ a: 1 }).toEqual(expect.objectContaining({ a: 1 }));
            expect(() => {
                throw new Error('test');
            }).toThrow('test');

            // Async testing
            const asyncFn = async () => 'result';
            void expect(asyncFn()).resolves.toBe('result');
            // expect(asyncFn()).rejects.toThrow(); // Para testar rejeições

            // Mock functions
            const mockFn = jest.fn();
            mockFn('arg1', 'arg2');

            expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
            expect(mockFn).toHaveBeenCalledTimes(1);
        });
    });

    describe('5. Best Practices Summary', () => {
        it('should demonstrate proper test structure', () => {
            // ✓ Arrange - Setup dos dados e mocks
            const mockResponse = { result: 'success' };

            // ✓ Act - Executar o código sendo testado
            const result = { result: 'success' }; // Simulação

            // ✓ Assert - Verificar o comportamento esperado
            expect(result).toEqual(mockResponse);
            expect(result.result).toBe('success');
        });

        it('should show proper error testing', async () => {
            // Testar cenários de erro
            const errorFunction = async () => {
                throw new Error('Test error');
            };

            await expect(errorFunction()).rejects.toThrow('Test error');
            await expect(errorFunction()).rejects.toThrow(Error);
        });

        it('should demonstrate test isolation', () => {
            // Cada teste deve ser independente
            const state = { counter: 0 };

            // Modificar estado
            state.counter = 1;

            // Verificar modificação
            expect(state.counter).toBe(1);

            // Próximo teste terá estado limpo (graças ao beforeEach)
        });
    });
});
