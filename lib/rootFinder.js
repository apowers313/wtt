const fs = require('fs').promises;
const path = require('path');

/**
 * Finds the actual repository root, handling both main repo and worktree cases
 */
class RootFinder {
  /**
   * Find the repository root starting from the current directory
   * @param {string} startDir - Starting directory (defaults to process.cwd())
   * @returns {Promise<{root: string, isWorktree: boolean, worktreeName?: string}>}
   */
  async findRoot(startDir = process.cwd()) {
    // First, find any git repository (main or worktree)
    const gitInfo = await this.findGitRoot(startDir);
    
    if (!gitInfo) {
      throw new Error('Not in a git repository');
    }
    
    // If we're in a worktree, find the main repository
    if (gitInfo.isWorktree) {
      const mainRoot = await this.findMainRepository(gitInfo.gitDir);
      return {
        root: mainRoot,
        isWorktree: true,
        worktreeName: path.basename(gitInfo.path),
        currentWorktreePath: gitInfo.path
      };
    }
    
    // We're in the main repository
    return {
      root: gitInfo.path,
      isWorktree: false
    };
  }
  
  /**
   * Find the nearest .git (file or directory) by traversing up
   * @param {string} startDir - Starting directory
   * @returns {Promise<{path: string, gitDir: string, isWorktree: boolean} | null>}
   */
  async findGitRoot(startDir) {
    let currentDir = path.resolve(startDir);
    const root = path.parse(currentDir).root;
    
    while (currentDir !== root) {
      const gitPath = path.join(currentDir, '.git');
      
      try {
        const stats = await fs.stat(gitPath);
        
        if (stats.isDirectory()) {
          // This is the main repository
          return {
            path: currentDir,
            gitDir: gitPath,
            isWorktree: false
          };
        } else if (stats.isFile()) {
          // This is a worktree - .git is a file pointing to the real git dir
          const gitFileContent = await fs.readFile(gitPath, 'utf8');
          const match = gitFileContent.match(/^gitdir: (.+)$/);
          
          if (match) {
            const gitDir = match[1].trim();
            // Handle relative paths
            const absoluteGitDir = path.isAbsolute(gitDir) 
              ? gitDir 
              : path.resolve(currentDir, gitDir);
              
            return {
              path: currentDir,
              gitDir: absoluteGitDir,
              isWorktree: true
            };
          }
        }
      } catch (error) {
        // .git doesn't exist here, continue searching
      }
      
      // Move up one directory
      currentDir = path.dirname(currentDir);
    }
    
    return null;
  }
  
  /**
   * Given a worktree's git directory, find the main repository root
   * @param {string} worktreeGitDir - Path to the worktree's git directory
   * @returns {Promise<string>} - Path to the main repository root
   */
  async findMainRepository(worktreeGitDir) {
    // Worktree git directories are typically at:
    // <main-repo>/.git/worktrees/<worktree-name>
    // So we need to go up 3 levels to get the main repo
    
    // First check if this looks like a worktree git dir
    if (worktreeGitDir.includes('.git/worktrees/')) {
      // Extract the main repo path
      const parts = worktreeGitDir.split(path.sep);
      const gitIndex = parts.lastIndexOf('.git');
      
      if (gitIndex > 0) {
        const mainRepoPath = parts.slice(0, gitIndex).join(path.sep);
        
        // Verify this is actually a git repository
        try {
          const gitPath = path.join(mainRepoPath, '.git');
          const stats = await fs.stat(gitPath);
          if (stats.isDirectory()) {
            return mainRepoPath;
          }
        } catch (error) {
          // Fall through to alternative method
        }
      }
    }
    
    // Alternative method: look for commondir file
    try {
      const commondirPath = path.join(worktreeGitDir, 'commondir');
      const commondir = await fs.readFile(commondirPath, 'utf8');
      const gitCommonDir = commondir.trim();
      
      // commondir points to the main .git directory
      const absoluteCommonDir = path.isAbsolute(gitCommonDir)
        ? gitCommonDir
        : path.resolve(worktreeGitDir, gitCommonDir);
      
      // The main repo is one level up from .git
      return path.dirname(absoluteCommonDir);
    } catch (error) {
      // If all else fails, throw an error
      throw new Error('Could not determine main repository location from worktree');
    }
  }
  
  /**
   * Find the nearest .worktree-config.json file starting from a directory
   * @param {string} startDir - Starting directory
   * @returns {Promise<string|null>} - Path to the config file or null
   */
  async findConfigFile(startDir = process.cwd()) {
    let currentDir = path.resolve(startDir);
    const root = path.parse(currentDir).root;
    
    while (currentDir !== root) {
      const configPath = path.join(currentDir, '.worktree-config.json');
      
      try {
        await fs.access(configPath);
        return configPath;
      } catch (error) {
        // Config doesn't exist here, continue searching
      }
      
      // Move up one directory
      currentDir = path.dirname(currentDir);
    }
    
    return null;
  }
  
  /**
   * Get the root directory for worktree operations
   * This finds the main repository root, even if called from within a worktree
   * @param {string} startDir - Starting directory (defaults to process.cwd())
   * @returns {Promise<string>} - The main repository root directory
   */
  async getMainRepoRoot(startDir = process.cwd()) {
    const result = await this.findRoot(startDir);
    return result.root;
  }
}

module.exports = new RootFinder();