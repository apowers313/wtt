const path = require('path');
const os = require('os');

/**
 * Cross-platform path utilities for consistent path handling
 * This module provides a single source of truth for path operations
 */
class PathUtils {
  /**
   * Normalize a path for consistent comparison across platforms
   * @param {string} inputPath - The path to normalize
   * @returns {string} Normalized path using forward slashes
   */
  static normalize(inputPath) {
    if (!inputPath) return '';
    
    // Convert to absolute path if relative
    const absolutePath = path.isAbsolute(inputPath) 
      ? inputPath 
      : path.resolve(inputPath);
    
    // Always use forward slashes for consistency
    return absolutePath.replace(/\\/g, '/');
  }

  /**
   * Compare two paths for equality across platforms
   * @param {string} path1 - First path
   * @param {string} path2 - Second path
   * @returns {boolean} True if paths are equivalent
   */
  static equals(path1, path2) {
    return this.normalize(path1) === this.normalize(path2);
  }

  /**
   * Check if a path ends with a specific suffix
   * @param {string} fullPath - The full path
   * @param {string} suffix - The suffix to check
   * @returns {boolean} True if path ends with suffix
   */
  static endsWith(fullPath, suffix) {
    const normalizedPath = this.normalize(fullPath);
    const normalizedSuffix = this.normalize(suffix);
    return normalizedPath.endsWith(normalizedSuffix);
  }

  /**
   * Get the relative path from base to target
   * @param {string} from - Base path
   * @param {string} to - Target path
   * @returns {string} Relative path with forward slashes
   */
  static relative(from, to) {
    const relativePath = path.relative(from, to);
    return relativePath.replace(/\\/g, '/');
  }

  /**
   * Join path segments using the platform separator
   * @param {...string} segments - Path segments to join
   * @returns {string} Joined path using platform separator
   */
  static join(...segments) {
    return path.join(...segments);
  }

  /**
   * Join path segments and normalize to forward slashes
   * @param {...string} segments - Path segments to join
   * @returns {string} Joined path with forward slashes
   */
  static joinNormalized(...segments) {
    return this.normalize(path.join(...segments));
  }

  /**
   * Convert a path to use forward slashes (for git commands)
   * @param {string} inputPath - Path to convert
   * @returns {string} Path with forward slashes
   */
  static toPosix(inputPath) {
    return inputPath.replace(/\\/g, '/');
  }

  /**
   * Convert a path to use platform-specific separators
   * @param {string} inputPath - Path to convert
   * @returns {string} Path with platform separators
   */
  static toPlatform(inputPath) {
    if (os.platform() === 'win32') {
      return inputPath.replace(/\//g, '\\');
    }
    return inputPath;
  }

  /**
   * Extract the worktree name from a path
   * @param {string} worktreePath - Path containing worktree
   * @returns {string|null} Worktree name or null
   */
  static extractWorktreeName(worktreePath) {
    const normalized = this.normalize(worktreePath);
    const match = normalized.match(/\.worktrees\/([^\/]+)/);
    return match ? match[1] : null;
  }

  /**
   * Check if a path is a worktree path
   * @param {string} inputPath - Path to check
   * @returns {boolean} True if path is a worktree
   */
  static isWorktreePath(inputPath) {
    const normalized = this.normalize(inputPath);
    return normalized.includes('/.worktrees/');
  }
}

module.exports = PathUtils;