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
      testEnvironment: 'node',
      reporters: [
        'default',
        [
          'jest-html-reporter',
          {
            pageTitle: 'SSERP Unit Report',
            outputPath: 'reports/jest/unit.html',
            includeFailureMsg: true,
          },
        ],
      ],
    },
    {
      displayName: 'integration',
      rootDir: '.',
      testMatch: ['<rootDir>/test/integration/**/*.integration.spec.ts'],
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      moduleFileExtensions: ['js', 'json', 'ts'],
      testEnvironment: 'node',
      globalSetup: '<rootDir>/test/integration/global-setup.ts',
      globalTeardown: '<rootDir>/test/integration/global-teardown.ts',
      reporters: [
        'default',
        [
          'jest-html-reporter',
          {
            pageTitle: 'SSERP Integration Report',
            outputPath: 'reports/jest/integration.html',
            includeFailureMsg: true,
          },
        ],
        '<rootDir>/test/reporters/route-coverage.reporter.js',
      ],
    },
  ],
};
