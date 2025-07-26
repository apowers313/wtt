const fs = require('fs').promises;
const path = require('path');
const { translateFSError, translateJSONError } = require('./errorTranslator');
const rootFinder = require('./rootFinder');
const simpleGit = require('simple-git');

const CONFIG_FILE = '.worktree-config.json';
const DEFAULT_CONFIG = {
  baseDir: '.worktrees',
  portRanges: {
    vite: { start: 3000, increment: 10 },
    storybook: { start: 6006, increment: 10 },
    custom: { start: 8000, increment: 10 }
  },
  mainBranch: 'main', // Will be detected and updated during init
  namePattern: '{branch}',
  autoCleanup: true,
  prompts: {
    default: '⚡{worktree}{dirty} {cwd} ▶ '
  }
};

class Config {
  constructor() {
    this.config = null;
    this.configPath = null;
    this.mainRoot = null;
  }

  async detectMainBranch() {
    const commonMainBranches = ['main', 'master', 'trunk', 'development'];
    
    try {
      const git = simpleGit(this.mainRoot);
      
      // First, check if we're in an empty repository (no commits)
      // In this case, check the default branch name from HEAD
      try {
        const headRef = await git.raw(['symbolic-ref', 'HEAD']);
        if (headRef.startsWith('refs/heads/')) {
          const defaultBranch = headRef.replace('refs/heads/', '').trim();
          // Return the default branch if it's one of the common names
          if (commonMainBranches.includes(defaultBranch)) {
            return defaultBranch;
          }
        }
      } catch {
        // symbolic-ref might fail if HEAD is detached, continue with other methods
      }
      
      // Check existing branches
      const branches = await git.branch(['-a']);
      
      // Check local branches first
      for (const branchName of commonMainBranches) {
        if (branches.all.includes(branchName)) {
          return branchName;
        }
      }
      
      // Check remote branches if no local main branch found
      for (const branchName of commonMainBranches) {
        const remoteBranch = `origin/${branchName}`;
        if (branches.all.includes(remoteBranch)) {
          return branchName;
        }
      }
      
      // Fallback to 'main' if no common branch found
      return 'main';
    } catch (error) {
      // If git operations fail, fallback to 'main'
      return 'main';
    }
  }

  async init(startDir = process.cwd()) {
    // Always find the main repository root
    this.mainRoot = await rootFinder.getMainRepoRoot(startDir);
    this.configPath = path.join(this.mainRoot, CONFIG_FILE);
    
    try {
      await fs.access(this.configPath);
      // Config exists, load it
      const result = await this.load(startDir);
      
      // Check if .gitignore needs updating for worktree directories
      await this.updateGitignore();
      
      return result;
    } catch (error) {
      // Access failed, create new config
      try {
        // Detect the actual main branch for this repository
        const detectedMainBranch = await this.detectMainBranch();
        const configToWrite = {
          ...DEFAULT_CONFIG,
          mainBranch: detectedMainBranch
        };
        
        await fs.writeFile(
          this.configPath,
          JSON.stringify(configToWrite, null, 2)
        );
        this.config = configToWrite;
        
        const baseDir = path.join(this.mainRoot, configToWrite.baseDir);
        await fs.mkdir(baseDir, { recursive: true });
        
        // Update .gitignore to exclude worktree directories
        await this.updateGitignore();
        
        return this.config;
      } catch (writeError) {
        throw new Error(translateFSError(writeError, 'create configuration file'));
      }
    }
  }

  async load(startDir = process.cwd()) {
    // Always find the main repository root
    this.mainRoot = await rootFinder.getMainRepoRoot(startDir);
    this.configPath = path.join(this.mainRoot, CONFIG_FILE);
    
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      const loadedConfig = JSON.parse(data);
      // Deep merge to ensure nested objects like prompts are properly merged
      this.config = {
        ...DEFAULT_CONFIG,
        ...loadedConfig,
        portRanges: {
          ...DEFAULT_CONFIG.portRanges,
          ...(loadedConfig.portRanges || {})
        },
        prompts: {
          ...DEFAULT_CONFIG.prompts,
          ...(loadedConfig.prompts || {})
        }
      };
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('No worktree configuration found in this repository. Please run "wt init" to set up the worktree tool');
      }
      if (error instanceof SyntaxError) {
        throw new Error(translateJSONError(error, CONFIG_FILE));
      }
      throw new Error(translateFSError(error, 'read configuration file'));
    }
  }

  async save() {
    if (!this.config || !this.configPath) {
      throw new Error('Configuration hasn\'t been loaded yet. This is an internal error - please report it as a bug');
    }
    
    try {
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2)
      );
    } catch (error) {
      throw new Error(translateFSError(error, 'save configuration'));
    }
  }

  async exists(startDir = process.cwd()) {
    try {
      // First check if we're even in a git repository
      const gitInfo = await rootFinder.findGitRoot(startDir);
      if (!gitInfo) {
        return false;
      }
      
      // Get the main repo root for this specific git repository
      const mainRoot = await rootFinder.getMainRepoRoot(startDir);
      
      // Check if config exists in this repository
      await fs.access(path.join(mainRoot, CONFIG_FILE));
      return true;
    } catch {
      return false;
    }
  }

  get() {
    if (!this.config) {
      throw new Error('Configuration hasn\'t been loaded yet. This is an internal error - please report it as a bug');
    }
    return this.config;
  }

  getWorktreeName(branchName) {
    if (!this.config) {
      throw new Error('Configuration hasn\'t been loaded yet. This is an internal error - please report it as a bug');
    }
    return this.config.namePattern.replace('{branch}', branchName);
  }

  getWorktreePath(worktreeName) {
    if (!this.config || !this.mainRoot) {
      throw new Error('Configuration hasn\'t been loaded yet. This is an internal error - please report it as a bug');
    }
    return path.join(this.mainRoot, this.config.baseDir, worktreeName);
  }

  getBaseDir() {
    if (!this.config || !this.mainRoot) {
      throw new Error('Configuration hasn\'t been loaded yet. This is an internal error - please report it as a bug');
    }
    return path.join(this.mainRoot, this.config.baseDir);
  }

  async updateGitignore() {
    const gitignorePath = path.join(this.mainRoot, '.gitignore');
    const linesToAdd = [
      this.config.baseDir + '/'
    ];
    
    try {
      // Read existing .gitignore or create empty content
      let content = '';
      try {
        content = await fs.readFile(gitignorePath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // File doesn't exist, we'll create it
      }
      
      // Check which lines need to be added
      const existingLines = content.split('\n').map(line => line.trim());
      const newLines = [];
      
      for (const line of linesToAdd) {
        if (!existingLines.includes(line) && !existingLines.includes('/' + line)) {
          newLines.push(line);
        }
      }
      
      // Only update if there are new lines to add
      if (newLines.length > 0) {
        // Ensure file ends with newline before adding new lines
        if (content && !content.endsWith('\n')) {
          content += '\n';
        }
        
        // Add comment if this is the first time
        if (!existingLines.some(line => line.includes('worktree'))) {
          content += '\n# Worktree Tool - ignore worktree directories\n';
        }
        
        content += newLines.join('\n') + '\n';
        
        await fs.writeFile(gitignorePath, content);
      }
    } catch (error) {
      // Don't fail init if we can't update .gitignore
      // Just log a warning
      console.log('Warning: Could not update .gitignore:', error.message);
    }
  }
}

module.exports = new Config();