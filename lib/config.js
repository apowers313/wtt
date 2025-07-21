const fs = require('fs').promises;
const path = require('path');

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
  autoCleanup: true
};

class Config {
  constructor() {
    this.config = null;
    this.configPath = null;
  }

  async init(rootPath = process.cwd()) {
    this.configPath = path.join(rootPath, CONFIG_FILE);
    
    try {
      await fs.access(this.configPath);
      return await this.load();
    } catch {
      await fs.writeFile(
        this.configPath,
        JSON.stringify(DEFAULT_CONFIG, null, 2)
      );
      this.config = DEFAULT_CONFIG;
      
      const baseDir = path.join(rootPath, DEFAULT_CONFIG.baseDir);
      await fs.mkdir(baseDir, { recursive: true });
      
      return this.config;
    }
  }

  async load(rootPath = process.cwd()) {
    if (!this.configPath) {
      this.configPath = path.join(rootPath, CONFIG_FILE);
    }
    
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(data);
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Configuration not found. Run "wt init" first.');
      }
      throw error;
    }
  }

  async save() {
    if (!this.config || !this.configPath) {
      throw new Error('Configuration not loaded');
    }
    
    await fs.writeFile(
      this.configPath,
      JSON.stringify(this.config, null, 2)
    );
  }

  async exists(rootPath = process.cwd()) {
    try {
      await fs.access(path.join(rootPath, CONFIG_FILE));
      return true;
    } catch {
      return false;
    }
  }

  get() {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return this.config;
  }

  getWorktreeName(branchName) {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return this.config.namePattern.replace('{branch}', branchName);
  }

  getWorktreePath(worktreeName, rootPath = process.cwd()) {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    const result = path.join(rootPath, this.config.baseDir, worktreeName);
    console.log('[DEBUG] config.getWorktreePath - Input:', { worktreeName, rootPath });
    console.log('[DEBUG] config.getWorktreePath - baseDir:', this.config.baseDir);
    console.log('[DEBUG] config.getWorktreePath - Result:', result);
    return result;
  }

  getBaseDir(rootPath = process.cwd()) {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return path.join(rootPath, this.config.baseDir);
  }
}

module.exports = new Config();