const fs = require('fs').promises;
const path = require('path');
const { translateFSError, translateJSONError } = require('./errorTranslator');
const rootFinder = require('./rootFinder');

const CONFIG_FILE = '.worktree-config.json';
const DEFAULT_CONFIG = {
  baseDir: '.worktrees',
  portRanges: {
    vite: { start: 3000, increment: 10 },
    storybook: { start: 6006, increment: 10 },
    custom: { start: 8000, increment: 10 }
  },
  mainBranch: 'main',
  namePattern: 'wt-{branch}',
  autoCleanup: true,
  prompts: {
    bash: '{purple}⚡{green}{worktree}{purple}{dirty} {cyan}{cwd} {blue}▶{reset} ',
    zsh: '%F{magenta}⚡%f%F{green}{worktree}%f%F{magenta}{dirty}%f %F{cyan}{cwd}%f %F{blue}▶%f ',
    fish: '{magenta}⚡{green}{worktree}{magenta}{dirty} {cyan}{cwd} {blue}▶ {normal}',
    powershell: '{magenta}⚡{green}{worktree}{magenta}{dirty} {cyan}{cwd} {blue}▶ ',
    default: '[{worktree}]> '
  }
};

class Config {
  constructor() {
    this.config = null;
    this.configPath = null;
    this.mainRoot = null;
  }

  async init(startDir = process.cwd()) {
    // Always find the main repository root
    this.mainRoot = await rootFinder.getMainRepoRoot(startDir);
    this.configPath = path.join(this.mainRoot, CONFIG_FILE);
    
    try {
      await fs.access(this.configPath);
      return await this.load(startDir);
    } catch (error) {
      // Access failed, create new config
      try {
        await fs.writeFile(
          this.configPath,
          JSON.stringify(DEFAULT_CONFIG, null, 2)
        );
        this.config = DEFAULT_CONFIG;
        
        const baseDir = path.join(this.mainRoot, DEFAULT_CONFIG.baseDir);
        await fs.mkdir(baseDir, { recursive: true });
        
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
      const mainRoot = await rootFinder.getMainRepoRoot(startDir);
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
}

module.exports = new Config();