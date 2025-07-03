import { DiffAnalyzerService } from '@/core/infrastructure/adapters/services/diff/diff-analyzer.service';
import { Test, TestingModule } from '@nestjs/testing';
import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages';
import { getTestCases } from './cases';
import { GetGraphsUseCase } from '@/core/application/use-cases/ast/graphs/get-graphs.use-case';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { REPOSITORY_MANAGER_TOKEN } from '@/core/domain/repository/contracts/repository-manager.contract';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service';

describe('Diff', () => {
    let differService: DiffAnalyzerService;
    let getGraphsUseCase: GetGraphsUseCase;

    const log = jest.fn(({ message, error }) => {
        if (error) {
            console.error(`Error: ${message}`, error);
        } else {
            console.log(`Log: ${message}`);
        }
    });
    const logger = {
        log: jest.fn(),
        warn: jest.fn(log),
        error: jest.fn(log),
        debug: jest.fn(log),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DiffAnalyzerService,
                GetGraphsUseCase,
                {
                    provide: REPOSITORY_MANAGER_TOKEN,
                    useClass: RepositoryManagerService,
                },
                {
                    provide: PinoLoggerService,
                    useValue: logger,
                },
            ],
        }).compile();

        differService = module.get(DiffAnalyzerService);
        if (!differService) {
            throw new Error('DifferService not found');
        }

        getGraphsUseCase = module.get(GetGraphsUseCase);
        if (!getGraphsUseCase) {
            throw new Error('GetGraphsUseCase not found');
        }
    });

    const languages = Object.values(SupportedLanguage).filter(
        (l) => l === SupportedLanguage.TYPESCRIPT,
    );

    for (const language of languages) {
        const testCases = getTestCases(language);
        if (!testCases || testCases.length === 0) {
            throw new Error(`No test cases found for language: ${language}`);
        }

        console.log(`Running tests for language: ${language}`);
        console.log(`Number of test cases: ${testCases.length}`);

        test.each(testCases)(
            'test=%$, filePath=%s',
            async (filePath, repoData, diff, expected) => {
                // sanity checks (optional)
                expect(filePath).toBeDefined();
                expect(diff).toBeDefined();
                expect(expected).toBeDefined();

                const graphs = await getGraphsUseCase.execute(
                    {
                        headRepo: repoData,
                        baseRepo: repoData,
                    },
                    false,
                );

                // run the actual method
                const newDiff = await differService.getRelevantContent(
                    filePath,
                    diff,
                    graphs,
                    repoData,
                );

                // assertions
                expect(newDiff).toBeDefined();
                expect(newDiff).toEqual(expected);
            },
        );
    }
});
