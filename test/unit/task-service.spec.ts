// Teste unitário para TaskService
// Demonstra como testar services do NestJS

import { TaskService } from '@/core/application/services/task/task.service.js';
import { Test, type TestingModule } from '@nestjs/testing';

describe('TaskService', () => {
    let service: TaskService;
    let mockTaskManager: any;
    let mockTaskDispatcher: any;

    beforeEach(async () => {
        // Criar mocks para as dependências
        mockTaskManager = {
            createTask: jest.fn(),
        };

        mockTaskDispatcher = {
            dispatch: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TaskService,
                {
                    provide: 'ITaskManagerService', // Mesmo token usado no service
                    useValue: mockTaskManager,
                },
                {
                    provide: 'TASK_JOB_DISPATCHER',
                    useValue: mockTaskDispatcher,
                },
            ],
        }).compile();

        service = module.get<TaskService>(TaskService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('createAsyncTask', () => {
        it('should create task and dispatch job', async () => {
            // Arrange
            const taskId = 'test-task-123';
            const mockInput = {
                type: 'AST_INITIALIZE_REPOSITORY',
                payload: { repoName: 'test' },
                priority: 1,
            };

            mockTaskManager.createTask.mockResolvedValue(taskId);

            // Act
            const result = await service.createAsyncTask(mockInput);

            // Assert
            expect(result).toBe(taskId);
            expect(mockTaskManager.createTask).toHaveBeenCalledWith(1); // priority
            expect(mockTaskDispatcher.dispatch).toHaveBeenCalledWith({
                taskId,
                type: 'AST_INITIALIZE_REPOSITORY',
                payload: { repoName: 'test' },
                priority: 1,
                metadata: undefined,
            });
        });

        it('should handle task creation failure', async () => {
            // Arrange
            const error = new Error('Database error');
            mockTaskManager.createTask.mockRejectedValue(error);

            const mockInput = {
                type: 'AST_INITIALIZE_REPOSITORY',
                payload: { repoName: 'test' },
            };

            // Act & Assert
            await expect(service.createAsyncTask(mockInput)).rejects.toThrow(
                'Database error',
            );
            expect(mockTaskDispatcher.dispatch).not.toHaveBeenCalled();
        });

        it('should pass metadata to dispatcher', async () => {
            // Arrange
            const taskId = 'test-task-456';
            const metadata = { userId: '123', source: 'api' };

            mockTaskManager.createTask.mockResolvedValue(taskId);

            const mockInput = {
                type: 'AST_INITIALIZE_REPOSITORY',
                payload: { repoName: 'test' },
                metadata,
            };

            // Act
            await service.createAsyncTask(mockInput);

            // Assert
            expect(mockTaskDispatcher.dispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata,
                }),
            );
        });
    });
});
