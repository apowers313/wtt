const path = require('path');
const fs = require('fs').promises;

/**
 * Centralized path management for consistent worktree operations
 * 
 * Design principles:
 * - Always return absolute paths to avoid directory switching issues
 * - Normalize worktree names consistently (wt-prefix)
 * - Provide reliable worktree detection from any path
 * - Handle cross-platform path differences
 */
class PathManager {
  constructor(gitRoot) {
    if (!gitRoot) {
      throw new Error('PathManager requires gitRoot parameter');
    }
    this.gitRoot = path.resolve(gitRoot);
    this.worktreeBase = path.join(this.gitRoot, '.worktrees');
  }

  /**
   * Get absolute path to a worktree directory
   */
  getWorktreePath(name) {
    const normalizedName = this.normalizeWorktreeName(name);
    return path.join(this.worktreeBase, normalizedName);
  }

  /**
   * Normalize worktree names to use wt- prefix consistently
   */
  normalizeWorktreeName(name) {
    if (!name) {
      throw new Error('Worktree name cannot be empty');
    }
    
    // Remove any leading/trailing whitespace
    name = name.trim();
    
    // If already has wt- prefix, return as-is
    if (name.startsWith('wt-')) {
      return name;
    }
    
    return `wt-${name}`;
  }

  /**
   * Remove wt- prefix from worktree name if present
   */
  stripWorktreePrefix(name) {
    if (!name) return name;
    return name.startsWith('wt-') ? name.substring(3) : name;
  }

  /**
   * Check if a path is inside any worktree
   */
  isInWorktree(currentPath) {
    const absolutePath = path.resolve(currentPath);
    const relative = path.relative(this.worktreeBase, absolutePath);
    
    // If relative path starts with '..', it's outside worktree base
    return !relative.startsWith('..');
  }

  /**
   * Get worktree name from any path inside it
   * Returns null if not in a worktree
   */
  getWorktreeFromPath(currentPath) {
    if (!this.isInWorktree(currentPath)) {
      return null;
    }
    
    const absolutePath = path.resolve(currentPath);
    const relative = path.relative(this.worktreeBase, absolutePath);
    
    // Get the first directory component
    const firstComponent = relative.split(path.sep)[0];
    
    // Handle edge case where we're in .worktrees directory itself
    if (firstComponent === '.' || firstComponent === '') {
      return null;
    }
    
    return firstComponent;
  }

  /**
   * Check if a worktree directory exists
   */
  async worktreeExists(name) {
    try {
      const worktreePath = this.getWorktreePath(name);
      const stats = await fs.stat(worktreePath);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the .worktrees base directory path
   */
  getWorktreeBase() {
    return this.worktreeBase;
  }

  /**
   * Get the git repository root
   */
  getGitRoot() {
    return this.gitRoot;
  }

  /**
   * Get relative path from git root
   */
  getRelativeFromRoot(absolutePath) {
    return path.relative(this.gitRoot, absolutePath);
  }

  /**
   * Convert any worktree reference to its full path
   * Handles both full paths and worktree names
   */
  resolveWorktreePath(reference) {
    // If it's already an absolute path, check if it's valid
    if (path.isAbsolute(reference)) {
      if (this.isInWorktree(reference)) {
        return reference;
      }
      throw new Error(`Path ${reference} is not in a worktree`);
    }
    
    // Otherwise, treat as worktree name
    return this.getWorktreePath(reference);
  }

  /**
   * Get display name for a worktree (without wt- prefix)
   */
  getDisplayName(worktreeName) {
    return this.stripWorktreePrefix(worktreeName);
  }

  /**
   * Validate worktree name format
   */
  isValidWorktreeName(name) {
    if (!name || typeof name !== 'string') {
      return false;
    }
    
    // Allow basic alphanumeric, hyphens, underscores
    // Prevent path traversal and special characters
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(name.replace(/^wt-/, ''));
  }

  /**
   * Get configuration file path for a worktree
   */
  getWorktreeConfigPath(name) {
    return path.join(this.getWorktreePath(name), '.env.worktree');
  }

  /**
   * Create directory path if it doesn't exist
   */
  async ensureWorktreeBase() {
    try {
      await fs.mkdir(this.worktreeBase, { recursive: true });
      return true;
    } catch (error) {
      throw new Error(`Failed to create worktree base directory: ${error.message}`);
    }
  }
}

module.exports = PathManager;