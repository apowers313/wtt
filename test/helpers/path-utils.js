const path = require('path');

/**
 * Simplified path utilities for tests
 * Replaces the complex 125-line pathsEqual function
 */
class TestPathUtils {
  /**
   * Normalize path for consistent comparison
   * @param {string} inputPath - Path to normalize
   * @returns {string} Normalized path
   */
  static normalize(inputPath) {
    if (!inputPath) return '';
    
    // Convert to forward slashes and remove duplicates
    let normalized = inputPath.replace(/\\/g, '/').replace(/\/+/g, '/');
    
    // Remove trailing slash unless it's the root
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    // Resolve . and .. segments
    const segments = normalized.split('/');
    const resolved = [];
    
    for (const segment of segments) {
      if (segment === '..') {
        // Don't pop past root
        if (resolved.length > 0 && resolved[resolved.length - 1] !== '..') {
          resolved.pop();
        } else if (!normalized.startsWith('/')) {
          // Relative path, keep the ..
          resolved.push(segment);
        }
      } else if (segment !== '.' && segment !== '') {
        resolved.push(segment);
      }
    }
    
    // Reconstruct path
    const result = resolved.join('/');
    
    // Preserve absolute path indicator
    if (normalized.startsWith('/')) {
      return '/' + result;
    }
    
    return result || '.';
  }

  /**
   * Check if two paths are equal (after normalization)
   * @param {string} path1 - First path
   * @param {string} path2 - Second path
   * @returns {boolean} True if paths are equal
   */
  static areEqual(path1, path2) {
    return this.normalize(path1) === this.normalize(path2);
  }

  /**
   * Join path segments
   * @param {...string} parts - Path segments to join
   * @returns {string} Joined path
   */
  static join(...parts) {
    // Filter out empty parts
    const nonEmptyParts = parts.filter(part => part && part.length > 0);
    if (nonEmptyParts.length === 0) return '.';
    
    // Use native path.join then normalize
    const joined = path.join(...nonEmptyParts);
    return this.normalize(joined);
  }

  /**
   * Get relative path from one path to another
   * @param {string} from - Source path
   * @param {string} to - Target path
   * @returns {string} Relative path
   */
  static relative(from, to) {
    const fromNorm = this.normalize(from);
    const toNorm = this.normalize(to);
    
    // Handle exact match
    if (fromNorm === toNorm) return '.';
    
    // Use native path.relative then normalize
    const relative = path.relative(fromNorm, toNorm);
    return this.normalize(relative);
  }

  /**
   * Check if a path is absolute
   * @param {string} inputPath - Path to check
   * @returns {boolean} True if path is absolute
   */
  static isAbsolute(inputPath) {
    return path.isAbsolute(inputPath);
  }

  /**
   * Get the directory name of a path
   * @param {string} inputPath - Path to process
   * @returns {string} Directory name
   */
  static dirname(inputPath) {
    return this.normalize(path.dirname(inputPath));
  }

  /**
   * Get the base name of a path
   * @param {string} inputPath - Path to process
   * @param {string} [ext] - Extension to remove
   * @returns {string} Base name
   */
  static basename(inputPath, ext) {
    return path.basename(inputPath, ext);
  }

  /**
   * Resolve a sequence of paths into an absolute path
   * @param {...string} pathSegments - Path segments to resolve
   * @returns {string} Resolved absolute path
   */
  static resolve(...pathSegments) {
    return this.normalize(path.resolve(...pathSegments));
  }

  /**
   * Convert path to use forward slashes (for cross-platform tests)
   * @param {string} inputPath - Path to convert
   * @returns {string} Path with forward slashes
   */
  static toForwardSlashes(inputPath) {
    return inputPath.replace(/\\/g, '/');
  }

  /**
   * Compare paths for testing (handles various edge cases)
   * This is a simplified version of the original pathsEqual function
   * @param {string} actual - Actual path from test
   * @param {string} expected - Expected path
   * @returns {boolean} True if paths are equivalent
   */
  static compareForTest(actual, expected) {
    // Handle null/undefined
    if (!actual && !expected) return true;
    if (!actual || !expected) return false;
    
    // Normalize both paths
    const normalizedActual = this.normalize(actual);
    const normalizedExpected = this.normalize(expected);
    
    // Direct comparison
    if (normalizedActual === normalizedExpected) return true;
    
    // Try resolving both to absolute paths and comparing
    try {
      const resolvedActual = this.resolve(normalizedActual);
      const resolvedExpected = this.resolve(normalizedExpected);
      return resolvedActual === resolvedExpected;
    } catch {
      // If resolve fails, fall back to normalized comparison
      return false;
    }
  }
}

module.exports = TestPathUtils;