import { DifferService } from '@/core/infrastructure/adapters/services/ast/differ.service';
import { mockData } from './mock';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import {
    ASTDeserializer,
    SerializedGetGraphsResponseData,
} from '@kodus/kodus-proto/serialization/ast';
import * as fs from 'fs';
import * as path from 'path';

describe('Diff', () => {
    const graphsFile = fs.readFileSync(path.join(__dirname, 'graphs.json'));
    const serialGraphs = JSON.parse(
        graphsFile.toString(),
    ) as SerializedGetGraphsResponseData;
    const graphs =
        ASTDeserializer.deserializeGetGraphsResponseData(serialGraphs);

    let differService: DifferService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [DifferService, PinoLoggerService],
        }).compile();

        differService = module.get(DifferService);
        if (!differService) {
            throw new Error('DifferService not found');
        }
    });

    it('should match the expected content for each language', () => {
        mockData.typescript.forEach((file) => {
            const { filePath, diff, content, expected } = file;
            expect(filePath).toBeDefined();
            expect(diff).toBeDefined();
            expect(content).toBeDefined();
            expect(expected).toBeDefined();

            const newDiff = differService.getRelevantContent(
                filePath,
                diff,
                content,
                graphs,
            );
            expect(newDiff).toBeDefined();
            expect(newDiff).toEqual(expected);
        });
    });
});
