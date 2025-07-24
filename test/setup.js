const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.WTT_AUTO_CONFIRM = 'true';
process.env.WTT_ERROR_LEVEL = 'simple';

// Ensure test directory exists
beforeAll(async () => {
  const testDir = path.join(os.tmpdir(), 'wtt-tests');
  await fs.ensureDir(testDir);
});

// Clean up any hanging test repos after all tests
afterAll(async () => {
  const testDir = path.join(os.tmpdir(), 'wtt-tests');
  
  try {
    const repos = await fs.readdir(testDir);
    
    // Clean up old test repos (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const repo of repos) {
      const repoPath = path.join(testDir, repo);
      try {
        const stats = await fs.stat(repoPath);
        if (stats.mtimeMs < oneHourAgo) {
          await fs.remove(repoPath);
        }
      } catch (error) {
        // Ignore errors for individual repos (they might have been cleaned up already)
        if (error.code !== 'ENOENT') {
          console.warn(`Warning: Could not clean up ${repoPath}:`, error.message);
        }
      }
    }
  } catch (error) {
    // Ignore errors if the test directory doesn't exist
    if (error.code !== 'ENOENT') {
      console.warn('Warning: Could not clean up test directory:', error.message);
    }
  }
});