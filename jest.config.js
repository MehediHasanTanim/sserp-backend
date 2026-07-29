/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      rootDir: '.',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      testPathIgnorePatterns: ['\\.integration\\.spec\\.ts$'],
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      moduleFileExtensions: ['js', 'json', 'ts'],
      collectCoverageFrom: [
        'src/modules/**/services/**/*.ts',
        'src/shared/**/*.ts',
        '!src/**/*.module.ts',
        '!src/**/*.dto.ts',
      ],
      coverageDirectory: './coverage/unit',
      testEnvironment: 'node',
    },
    {
      displayName: 'integration',
      rootDir: '.',
      testMatch: ['<rootDir>/test/integration/**/*.integration.spec.ts'],
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      moduleFileExtensions: ['js', 'json', 'ts'],
      testEnvironment: 'node',
    },
  ],
  coverageThreshold: {
    global: { lines: 50, branches: 40, functions: 40, statements: 50 },
  },
};
