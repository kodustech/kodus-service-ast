// jest.config.js
module.exports = {
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^test/mocks/(.*)$': '<rootDir>/test/mocks/$1',
    },
    moduleFileExtensions: ['js', 'json', 'ts'],
    roots: ['src', 'test'],
    testRegex: '.*\\.spec\\.ts$',
    transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
    },
    collectCoverageFrom: ['**/*.(t|j)s'],
    coverageDirectory: '../coverage',
    testEnvironment: 'node',
    setupFiles: ['dotenv/config'],
};
