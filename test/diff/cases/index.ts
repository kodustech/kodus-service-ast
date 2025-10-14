import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages';
import { RepositoryData } from '@/shared/types/ast';
import { mockData } from './mock';

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
