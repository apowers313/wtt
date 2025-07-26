module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.worktrees/'
  ],
  // Reduce parallel workers to avoid output jumbling
  maxWorkers: '50%',
  // Disable interactive progress updates that cause garbled output
  // This fixes issues with GNU Screen and other terminal multiplexers
  silent: false,
  verbose: false,
  // Force CI mode to use non-interactive reporter
  ci: true,
  collectCoverageFrom: [
    'lib/**/*.js',
    'commands/**/*.js',
    '!**/node_modules/**',
    '!**/.worktrees/**'
  ],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 50,
      lines: 35,
      statements: 35
    }
  },
  testTimeout: 30000, // 30 seconds for integration tests
  setupFilesAfterEnv: [
    '<rootDir>/test/setup.js',
    '<rootDir>/test/setup/git-env.js'
  ],
  globalSetup: '<rootDir>/test/globalSetup.js',
  globalTeardown: '<rootDir>/test/globalTeardown.js',
  moduleNameMapper: {
    '^inquirer$': '<rootDir>/test/mocks/inquirer.js'
  }
};