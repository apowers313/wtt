/**
 * Jest setup file to ensure git environment is test-safe
 * Add to jest.config.js: setupFilesAfterEnv: ['<rootDir>/test/setup/git-env.js']
 */

const GitConfigHelper = require('../helpers/git-config-helper');

// Store original environment
const originalEnv = { ...process.env };

beforeAll(() => {
  // Set test-safe environment variables globally for all tests
  const testEnv = GitConfigHelper.getTestEnvironment(process.cwd());
  
  // Only set the most critical ones globally to avoid breaking other tools
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  process.env.GIT_TERMINAL_PROMPT = '0';
  process.env.GPG_TTY = '';
  
  // Log warning if user has problematic git config
  if (process.env.CI !== 'true' && !process.env.SUPPRESS_GIT_CONFIG_WARNING) {
    try {
      const { execSync } = require('child_process');
      const gpgSign = execSync('git config --global --get commit.gpgsign', { encoding: 'utf8' }).trim();
      
      if (gpgSign === 'true') {
        console.warn(`
⚠️  WARNING: Your global git config has commit.gpgsign=true
   This may cause test failures. Tests will attempt to disable it locally.
   To suppress this warning, set SUPPRESS_GIT_CONFIG_WARNING=1
        `);
      }
    } catch (e) {
      // Ignore - config might not be set
    }
  }
});

afterAll(() => {
  // Restore original environment
  Object.keys(process.env).forEach(key => {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  });
  Object.assign(process.env, originalEnv);
});

// Export for use in individual tests
module.exports = { GitConfigHelper };