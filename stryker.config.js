/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
module.exports = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'jest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/modules/**/services/**/*.ts',
    'src/shared/money/**/*.ts',
    'src/shared/utils/**/*.ts',
    'src/shared/guards/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
  ],
  thresholds: { high: 85, low: 75, break: 70 },
  jest: {
    projectType: 'custom',
    configFile: 'jest.config.js',
  },
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  concurrency: 4,
  timeoutMS: 30000,
};
