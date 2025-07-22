const fs = require('fs-extra');
const path = require('path');

module.exports = async () => {
  // Final cleanup of test directory if needed
  if (global.__TEST_DIR__) {
    try {
      // Don't remove the entire directory, just clean up old repos
      const repos = await fs.readdir(global.__TEST_DIR__);
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      
      for (const repo of repos) {
        const repoPath = path.join(global.__TEST_DIR__, repo);
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
  }
};