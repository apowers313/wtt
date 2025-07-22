module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/unit/**/*.test.js'
  ],
  collectCoverageFrom: [
    'lib/**/*.js',
    'commands/**/*.js',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 50,
      lines: 35,
      statements: 35
    }
  },
  testTimeout: 10000, // 10 seconds for unit tests
  // No global setup/teardown for unit tests - they don't need file system
  moduleNameMapper: {
    '^inquirer$': '<rootDir>/test/mocks/inquirer.js'
  }
};