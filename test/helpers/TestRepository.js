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
    // Resolve symlinks to get the real path (important for macOS)
    this.dir = await fs.realpath(this.dir);
    
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
    // Quote the tool path to handle spaces in Windows paths
    const fullCommand = `node "${this.toolPath}" ${command.replace('wt ', '')}`;
    
    // Debug logging for CI
    if (process.env.CI || process.env.DEBUG_TESTS) {
      console.log('\n[DEBUG] Running wt command:');
      console.log('  Full command:', fullCommand);
      console.log('  Working directory:', this.dir);
      console.log('  Tool path:', this.toolPath);
    }
    
    return await this.exec(fullCommand);
  }
  
  async git(command) {
    // Debug logging for git commands in CI
    if ((process.env.CI || process.env.DEBUG_TESTS) && process.env.DEBUG_GIT) {
      console.log('\n[DEBUG] Running git command:');
      console.log('  Command:', `git ${command}`);
      console.log('  Working directory:', this.dir);
    }
    
    return await this.exec(`git ${command}`);
  }
  
  async exec(command) {
    const startTime = Date.now();
    
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: this.dir });
      
      const result = { 
        exitCode: 0, 
        stdout: stdout.trim(), 
        stderr: stderr.trim() 
      };
      
      // Enhanced debug logging for CI
      if (process.env.CI || process.env.DEBUG_TESTS) {
        const duration = Date.now() - startTime;
        console.log('\n[DEBUG] Command execution:');
        console.log('  Command:', command);
        console.log('  Working dir:', this.dir);
        console.log('  Exit code:', result.exitCode);
        console.log('  Duration:', `${duration}ms`);
        console.log('  Platform:', process.platform);
        
        if (stdout.trim()) {
          console.log('  STDOUT:');
          stdout.trim().split('\n').forEach(line => console.log('    >', line));
        }
        
        if (stderr.trim()) {
          console.log('  STDERR:');
          stderr.trim().split('\n').forEach(line => console.log('    !', line));
        }
        
        // Special debugging for git worktree commands on Windows
        if (process.platform === 'win32' && command.includes('git worktree')) {
          console.log('  [WINDOWS] Git worktree command detected');
          console.log('  [WINDOWS] Raw stdout length:', stdout.length);
          console.log('  [WINDOWS] Raw stdout:', JSON.stringify(stdout));
        }
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      const result = { 
        exitCode: error.code || 1, 
        stdout: error.stdout?.trim() || '', 
        stderr: error.stderr?.trim() || error.message 
      };
      
      // Enhanced error debugging for CI
      if (process.env.CI || process.env.DEBUG_TESTS) {
        console.log('\n[DEBUG] Command failed:');
        console.log('  Command:', command);
        console.log('  Working dir:', this.dir);
        console.log('  Exit code:', result.exitCode);
        console.log('  Duration:', `${duration}ms`);
        console.log('  Platform:', process.platform);
        console.log('  Error message:', error.message);
        
        if (error.stdout) {
          console.log('  STDOUT:');
          error.stdout.trim().split('\n').forEach(line => console.log('    >', line));
        }
        
        if (error.stderr) {
          console.log('  STDERR:');
          error.stderr.trim().split('\n').forEach(line => console.log('    !', line));
        }
        
        // Log the full error object in CI for more details
        if (process.env.CI) {
          console.log('  Full error object:', JSON.stringify({
            message: error.message,
            code: error.code,
            killed: error.killed,
            signal: error.signal,
            cmd: error.cmd
          }, null, 2));
        }
      }
      
      return result;
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