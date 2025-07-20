const fs = require('fs-extra');
const path = require('path');
const os = require('os');

module.exports = async () => {
  // Ensure clean test environment
  const testDir = path.join(os.tmpdir(), 'wtt-tests');
  await fs.ensureDir(testDir);
  
  // Store test directory path for teardown
  global.__TEST_DIR__ = testDir;
};