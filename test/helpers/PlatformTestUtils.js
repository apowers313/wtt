const PathUtils = require('../../lib/pathUtils');
const path = require('path');

/**
 * Platform-agnostic test utilities for cross-platform testing
 */
class PlatformTestUtils {
  /**
   * Assert that output contains a path, handling platform differences
   * @param {string} output - The output to check
   * @param {string} expectedPath - The expected path
   * @param {string} message - Optional assertion message
   */
  static expectPathInOutput(output, expectedPath, message = '') {
    // Try multiple representations of the path
    const pathVariants = [
      expectedPath,
      PathUtils.normalize(expectedPath),
      PathUtils.toPosix(expectedPath),
      PathUtils.toPlatform(expectedPath)
    ];

    const found = pathVariants.some(variant => output.includes(variant));
    
    if (!found) {
      throw new Error(
        `${message}\nExpected output to contain path: ${expectedPath}\n` +
        `Tried variants: ${pathVariants.join(', ')}\n` +
        `Actual output: ${output}`
      );
    }
  }

  /**
   * Assert that two paths are equal across platforms
   * @param {string} actual - Actual path
   * @param {string} expected - Expected path
   * @param {string} message - Optional assertion message
   */
  static expectPathsEqual(actual, expected, message = '') {
    if (!PathUtils.equals(actual, expected)) {
      throw new Error(
        `${message}\nPaths are not equal:\n` +
        `Expected: ${expected} (normalized: ${PathUtils.normalize(expected)})\n` +
        `Actual: ${actual} (normalized: ${PathUtils.normalize(actual)})`
      );
    }
  }

  /**
   * Find a worktree by name in a list, handling path differences
   * @param {Array} worktrees - List of worktree objects
   * @param {string} name - Worktree name to find
   * @returns {Object|null} Found worktree or null
   */
  static findWorktreeByName(worktrees, name) {
    return worktrees.find(wt => {
      const wtName = PathUtils.extractWorktreeName(wt.path);
      return wtName === name;
    });
  }

  /**
   * Assert that a worktree exists in the list
   * @param {Array} worktrees - List of worktree objects
   * @param {string} name - Worktree name
   * @param {string} message - Optional assertion message
   */
  static expectWorktreeExists(worktrees, name, message = '') {
    const found = this.findWorktreeByName(worktrees, name);
    if (!found) {
      const availableNames = worktrees
        .map(wt => PathUtils.extractWorktreeName(wt.path))
        .filter(n => n);
      
      throw new Error(
        `${message}\nWorktree '${name}' not found.\n` +
        `Available worktrees: ${availableNames.join(', ')}`
      );
    }
  }

  /**
   * Wait for a condition with retries
   * @param {Function} condition - Async function that returns true when condition is met
   * @param {number} timeout - Timeout in milliseconds
   * @param {number} interval - Retry interval in milliseconds
   * @returns {Promise<boolean>} True if condition was met
   */
  static async waitFor(condition, timeout = 5000, interval = 100) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        if (await condition()) {
          return true;
        }
      } catch (error) {
        // Ignore errors during condition check
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    return false;
  }

  /**
   * Create a path matcher for flexible assertions
   * @param {string} expectedPath - The expected path pattern
   * @returns {Function} Matcher function
   */
  static createPathMatcher(expectedPath) {
    const normalized = PathUtils.normalize(expectedPath);
    const worktreeName = PathUtils.extractWorktreeName(expectedPath);
    
    return (actualPath) => {
      // Direct match
      if (PathUtils.equals(actualPath, expectedPath)) {
        return true;
      }
      
      // Match by worktree name if it's a worktree path
      if (worktreeName) {
        const actualWorktreeName = PathUtils.extractWorktreeName(actualPath);
        return actualWorktreeName === worktreeName;
      }
      
      // Match if actual ends with expected
      return PathUtils.endsWith(actualPath, expectedPath);
    };
  }

  /**
   * Extract and normalize paths from command output
   * @param {string} output - Command output containing paths
   * @returns {Array<string>} Normalized paths found in output
   */
  static extractPaths(output) {
    // Common patterns for paths in output
    const patterns = [
      // Absolute paths
      /(?:^|\s)([A-Za-z]:[\\/][^\s]+)/g,  // Windows absolute
      /(?:^|\s)(\/[^\s]+)/g,               // Unix absolute
      // Relative paths with .worktrees
      /(?:^|\s)(\.[\\/]?worktrees[\\/][^\s]+)/g,
      // cd command paths
      /cd\s+["']?([^"'\s]+)["']?/g
    ];

    const paths = new Set();
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        paths.add(PathUtils.normalize(match[1]));
      }
    });
    
    return Array.from(paths);
  }

  /**
   * Get platform-specific test timeout
   * @param {number} baseTimeout - Base timeout in ms
   * @returns {number} Adjusted timeout for platform
   */
  static getTimeout(baseTimeout = 5000) {
    // Windows CI environments often need longer timeouts
    if (process.platform === 'win32' && process.env.CI) {
      return baseTimeout * 2;
    }
    return baseTimeout;
  }
}

module.exports = PlatformTestUtils;