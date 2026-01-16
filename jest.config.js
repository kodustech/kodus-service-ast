// jest.config.js
export default {
    preset: 'ts-jest/presets/default-esm',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@/(.*)\\.js$': '<rootDir>/src/$1',
    },
    moduleFileExtensions: ['js', 'mjs', 'json', 'ts'],
    testMatch: ['**/__tests__/**/*.ts', '**/*.(test|spec).ts'],
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                useESM: true,
                tsconfig: {
                    module: 'ESNext',
                    target: 'ES2022',
                },
            },
        ],
    },
    transformIgnorePatterns: [
        'node_modules/(?!(testcontainers|@testcontainers)/)',
    ],
    collectCoverageFrom: ['src/**/*.{ts,js}', 'test/**/*.{ts,js}'],
    coverageDirectory: 'coverage',
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/src/shared/utils/env-loader.ts'],
};
