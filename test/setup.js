const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Ensure test directory exists
beforeAll(async () => {
  const testDir = path.join(os.tmpdir(), 'wtt-tests');
  await fs.ensureDir(testDir);
});

// Clean up any hanging test repos after all tests
afterAll(async () => {
  const testDir = path.join(os.tmpdir(), 'wtt-tests');
  const repos = await fs.readdir(testDir);
  
  // Clean up old test repos (older than 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const repo of repos) {
    const repoPath = path.join(testDir, repo);
    const stats = await fs.stat(repoPath);
    if (stats.mtimeMs < oneHourAgo) {
      await fs.remove(repoPath);
    }
  }
});