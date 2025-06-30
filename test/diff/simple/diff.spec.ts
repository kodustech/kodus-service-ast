import { DiffAnalyzerService } from '@/core/infrastructure/adapters/services/diff/diff-analyzer.service';
import { mockData } from './mock';
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

describe('Diff', () => {
    const graphs = new Map<SupportedLanguage, GetGraphsResponseData>();
    let differService: DiffAnalyzerService;

    const getGraphs = (language: SupportedLanguage): GetGraphsResponseData => {
        const graph = graphs.get(language);
        if (graph) {
            return graph;
        }

        const graphsFile = fs.readFileSync(
            path.join(__dirname, '../graphs', `${language}.json`),
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

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [DiffAnalyzerService, PinoLoggerService],
        }).compile();

        differService = module.get(DiffAnalyzerService);
        if (!differService) {
            throw new Error('DifferService not found');
        }
    });

    it('should match the expected content for each language', () => {
        for (const language of Object.keys(mockData)) {
            const lang = language as SupportedLanguage;
            const mock = mockData[lang];

            if (!mock) {
                throw new Error(`No mock data found for language: ${lang}`);
            }

            const graphsData = getGraphs(lang);
            if (!graphsData) {
                throw new Error(`No graphs data found for language: ${lang}`);
            }

            mock.forEach((file) => {
                const { filePath, diff, content, expected } = file;
                expect(filePath).toBeDefined();
                expect(diff).toBeDefined();
                expect(content).toBeDefined();
                expect(expected).toBeDefined();

                const newDiff = differService.getRelevantContent(
                    filePath,
                    diff,
                    content,
                    graphsData,
                );
                expect(newDiff).toBeDefined();
                expect(newDiff).toEqual(expected);
            });
        }
    });
});
