const path = require('path');
const rootFinder = require('./rootFinder');

/**
 * Detects if the current working directory is inside a worktree and returns the worktree name
 * @param {string} startDir - Directory to start detection from (defaults to process.cwd())
 * @returns {Promise<string|null>} - Worktree name if inside a worktree, null otherwise
 */
async function getCurrentWorktree(startDir = process.cwd()) {
  try {
    // Find the main repository root
    const mainRoot = await rootFinder.getMainRepoRoot(startDir);
    
    // Normalize paths to handle different path separators
    const normalizedCwd = path.resolve(startDir).replace(/\\/g, '/');
    const normalizedRoot = path.resolve(mainRoot).replace(/\\/g, '/');
    
    // Check if we're inside the .worktrees directory
    const worktreesDir = path.join(normalizedRoot, '.worktrees').replace(/\\/g, '/');
    
    if (!normalizedCwd.startsWith(worktreesDir + '/')) {
      // Not inside .worktrees directory
      return null;
    }
    
    // Extract the worktree path relative to .worktrees
    const relativePath = path.relative(worktreesDir, normalizedCwd).replace(/\\/g, '/');
    
    // The worktree name is the first directory component
    const worktreeName = relativePath.split('/')[0];
    
    // Validate that this looks like a worktree name (not empty, no path separators)
    if (!worktreeName || worktreeName.includes('..') || worktreeName === '.') {
      return null;
    }
    
    return worktreeName;
    
  } catch (error) {
    // If we can't determine the repository structure, assume we're not in a worktree
    return null;
  }
}

module.exports = {
  getCurrentWorktree
};