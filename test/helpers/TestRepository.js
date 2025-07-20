const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class TestRepository {
  constructor() {
    this.dir = null;
    this.name = `test-repo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  async init() {
    // Create temp directory
    this.dir = path.join(os.tmpdir(), 'wtt-tests', this.name);
    await fs.ensureDir(this.dir);
    
    // Initialize git repo
    await this.git('init');
    await this.git('config user.email "test@example.com"');
    await this.git('config user.name "Test User"');
    await this.git('config commit.gpgsign false');
    
    // Create initial commit
    await this.writeFile('README.md', '# Test Repository');
    await this.git('add .');
    await this.git('commit -m "Initial commit"');
    
    // Rename master to main for consistency
    await this.git('branch -m master main');
    
    // Copy wt tool
    await this.installTool();
    
    return this;
  }
  
  async installTool() {
    // For testing, we'll run the tool from the original location
    // This avoids the need to copy node_modules
    this.toolPath = path.resolve(__dirname, '../../wt.js');
  }
  
  async run(command) {
    // Run wt command from original location but in test repository context
    const fullCommand = `node ${this.toolPath} ${command.replace('wt ', '')}`;
    return await this.exec(fullCommand);
  }
  
  async git(command) {
    return await this.exec(`git ${command}`);
  }
  
  async exec(command) {
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: this.dir });
      return { 
        exitCode: 0, 
        stdout: stdout.trim(), 
        stderr: stderr.trim() 
      };
    } catch (error) {
      return { 
        exitCode: error.code || 1, 
        stdout: error.stdout?.trim() || '', 
        stderr: error.stderr?.trim() || error.message 
      };
    }
  }
  
  async writeFile(filePath, content) {
    const fullPath = path.join(this.dir, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content);
  }
  
  async readFile(filePath) {
    return await fs.readFile(path.join(this.dir, filePath), 'utf8');
  }
  
  async exists(filePath) {
    try {
      await fs.access(path.join(this.dir, filePath));
      return true;
    } catch {
      return false;
    }
  }
  
  async inWorktree(worktreeName, callback) {
    const originalDir = this.dir;
    this.dir = path.join(this.dir, '.worktrees', worktreeName);
    try {
      await callback();
    } finally {
      this.dir = originalDir;
    }
  }
  
  async currentBranch() {
    const result = await this.git('branch --show-current');
    return result.stdout;
  }
  
  async createBranch(branchName) {
    await this.git(`checkout -b ${branchName}`);
    await this.git('checkout main');
  }
  
  async cleanup() {
    if (this.dir) {
      await fs.remove(this.dir);
    }
  }
}

module.exports = { TestRepository };