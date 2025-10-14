import { type SupportedLanguage } from '@/core/domain/parsing/types/supported-languages.js';
import { type RepositoryData } from '@/shared/types/ast.js';
import { mockData } from './mock.js';

export type TestCaseData = {
    repoData: Partial<RepositoryData>;
    filePath: string;
    diff: string;
    expected: string;
};

export type TestCase = [
    string, // filePath
    RepositoryData,
    string, // diff
    string, // expected
];

export function getTestCases(language: SupportedLanguage): TestCase[] {
    const cases = mockData[language];
    if (!cases) {
        throw new Error(`No test cases found for language: ${language}`);
    }

    return cases.map((testCase) => {
        return [
            testCase.filePath,
            testCase.repoData as RepositoryData,
            testCase.diff,
            testCase.expected,
        ];
    });
}
