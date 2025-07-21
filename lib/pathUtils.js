const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

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
    const debugPrefix = '[DEBUG] PathUtils.normalize';
    console.log(`${debugPrefix} - Input: "${inputPath}"`);
    
    if (!inputPath) {
      console.log(`${debugPrefix} - Empty input, returning empty string`);
      return '';
    }
    
    // Handle Windows absolute paths (C:\, D:\, etc.)
    const isWindowsAbsolute = /^[A-Za-z]:[\\\/]/.test(inputPath);
    console.log(`${debugPrefix} - isWindowsAbsolute: ${isWindowsAbsolute}`);
    console.log(`${debugPrefix} - path.isAbsolute: ${path.isAbsolute(inputPath)}`);
    
    // Convert to absolute path if relative
    let absolutePath = (path.isAbsolute(inputPath) || isWindowsAbsolute)
      ? inputPath 
      : path.resolve(inputPath);
    console.log(`${debugPrefix} - After absolute conversion: "${absolutePath}"`);
    
    // On Windows, resolve short/long filename inconsistencies (e.g., RUNNER~1 vs runneradmin)
    // This is critical for path comparison to work correctly
    if (os.platform() === 'win32') {
      console.log(`${debugPrefix} - Platform is Windows, attempting to resolve short names`);
      
      // Windows-specific: Try to get the long path name using Windows API
      // This handles 8.3 short names like RUNNER~1
      try {
        // First check if the path exists
        if (fs.existsSync(absolutePath)) {
          // Use Windows cmd to get the full long path name
          const longPath = execSync(`for %I in ("${absolutePath}") do @echo %~fI`, {
            encoding: 'utf8',
            shell: 'cmd.exe'
          }).trim();
          console.log(`${debugPrefix} - Windows long path resolution: "${longPath}"`);
          if (longPath) {
            absolutePath = longPath.replace(/\\/g, '/');
            console.log(`${debugPrefix} - Using Windows-resolved path: "${absolutePath}"`);
          }
        } else {
          // Path doesn't exist, try parent directory
          const parentDir = path.dirname(absolutePath);
          const fileName = path.basename(absolutePath);
          console.log(`${debugPrefix} - Path doesn't exist, trying parent: "${parentDir}"`);
          
          if (fs.existsSync(parentDir)) {
            const longParent = execSync(`for %I in ("${parentDir}") do @echo %~fI`, {
              encoding: 'utf8',
              shell: 'cmd.exe'
            }).trim();
            if (longParent) {
              absolutePath = path.join(longParent, fileName).replace(/\\/g, '/');
              console.log(`${debugPrefix} - Using parent-resolved path: "${absolutePath}"`);
            }
          }
        }
      } catch (error) {
        console.log(`${debugPrefix} - Windows path resolution failed: ${error.message}`);
        // Fall back to fs.realpathSync
        try {
          const realPath = fs.realpathSync(absolutePath);
          absolutePath = realPath.replace(/\\/g, '/');
          console.log(`${debugPrefix} - Fallback to realpathSync: "${absolutePath}"`);
        } catch (realpathError) {
          console.log(`${debugPrefix} - realpathSync also failed: ${realpathError.message}`);
        }
      }
    }
    
    // Always use forward slashes for consistency
    const normalized = absolutePath.replace(/\\/g, '/');
    console.log(`${debugPrefix} - Final normalized: "${normalized}"`);
    return normalized;
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
    if (!fullPath || !suffix) return false;
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
    if (!inputPath) return '';
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