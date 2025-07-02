import { DiffAnalyzerService } from '@/core/infrastructure/adapters/services/diff/diff-analyzer.service';
import { mockData as simpleMockData } from './simple/mock';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import {
    ASTDeserializer,
    SerializedGetGraphsResponseData,
} from '@kodus/kodus-proto/serialization/ast';
import * as fs from 'fs';
import * as path from 'path';
import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages';
import { GetGraphsResponseData } from '@kodus/kodus-proto/ast/v2';

type TestCase = [SupportedLanguage, string, string, string, string];

// Build test cases from mockData in a clear and type-safe way
const testCases: TestCase[] = [];

for (const [lang, files] of Object.entries(simpleMockData)) {
    if (!files) continue;
    for (const file of files) {
        testCases.push([
            lang as SupportedLanguage,
            file.filePath,
            file.diff,
            file.content,
            file.expected,
        ]);
    }
}

const graphs = new Map<SupportedLanguage, GetGraphsResponseData>();

const getGraphs = (language: SupportedLanguage): GetGraphsResponseData => {
    const graph = graphs.get(language);
    if (graph) {
        return graph;
    }

    const graphsFile = fs.readFileSync(
        path.join(__dirname, 'graphs', `${language}.json`),
    );
    const serialGraphs = JSON.parse(
        graphsFile.toString(),
    ) as SerializedGetGraphsResponseData;
    const deserialized =
        ASTDeserializer.deserializeGetGraphsResponseData(serialGraphs);

    if (!deserialized) {
        throw new Error(`Failed to deserialize graphs for ${language}`);
    }

    graphs.set(language, deserialized);
    return deserialized;
};

describe('Diff', () => {
    let differService: DiffAnalyzerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [DiffAnalyzerService, PinoLoggerService],
        }).compile();

        differService = module.get(DiffAnalyzerService);
        if (!differService) {
            throw new Error('DifferService not found');
        }
    });

    test.each(testCases)(
        'language=%s, filePath=%s',
        (language, filePath, diff, content, expected) => {
            // sanity checks (optional)
            expect(filePath).toBeDefined();
            expect(diff).toBeDefined();
            expect(content).toBeDefined();
            expect(expected).toBeDefined();

            // load graph data for this language
            const graphsData = getGraphs(language);
            expect(graphsData).toBeDefined();

            // run the actual method
            const newDiff = differService.getRelevantContent(
                filePath,
                diff,
                content,
                graphsData,
            );

            // assertions
            expect(newDiff).toBeDefined();
            expect(newDiff).toEqual(expected);
        },
    );
});
