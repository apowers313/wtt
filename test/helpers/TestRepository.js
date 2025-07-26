const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const gitTemplateCache = require('./git-template-cache');
const GitWrapper = require('./git-wrapper');

class TestRepository {
  constructor() {
    this.dir = null;
    this.name = `test-repo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  async init(useTemplate = true) {
    // Create temp directory
    this.dir = path.join(os.tmpdir(), 'wtt-tests', this.name);
    await fs.ensureDir(this.dir);
    // Resolve symlinks to get the real path (important for macOS)
    this.dir = await fs.realpath(this.dir);
    
    if (useTemplate) {
      // Use cached template - MUCH faster!
      await gitTemplateCache.copyToDirectory(this.dir);
    } else {
      // Fallback to old method if needed
      // Copy test git config to ensure consistent behavior
      const testGitConfig = path.join(__dirname, '../fixtures/test-gitconfig');
      const localGitConfig = path.join(this.dir, '.gitconfig');
      if (await fs.pathExists(testGitConfig)) {
        await fs.copy(testGitConfig, localGitConfig);
      }
      
      // Initialize git repo with isolated config
      await this.git('init');
      
      // Use local git config file for all settings
      await this.git(`config --local include.path ${localGitConfig}`);
      
      // Override any potentially problematic global settings
      await this.git('config --local user.email "test@example.com"');
      await this.git('config --local user.name "Test User"');
      await this.git('config --local commit.gpgsign false');
      await this.git('config --local tag.gpgsign false');
      await this.git('config --local core.autocrlf false');
      
      // Create initial commit
      await this.writeFile('README.md', '# Test Repository');
      await this.git('add .');
      await this.git('commit --no-gpg-sign -m "Initial commit"');
      
      // Rename master to main for consistency
      try {
        await this.git('branch -m master main');
      } catch (e) {
        // Branch might already be main
      }
    }
    
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
    
    // Save current directory and change to test repo
    const originalCwd = process.cwd();
    
    // Check if directory exists before changing to it
    if (!await this.exists('')) {
      throw new Error(`Test repository directory does not exist: ${this.dir}`);
    }
    
    process.chdir(this.dir);
    
    try {
      return await this.exec(fullCommand);
    } finally {
      // Always restore original directory
      try {
        process.chdir(originalCwd);
      } catch (error) {
        // Original directory might not exist anymore, try to change to a safe directory
        process.chdir(require('os').homedir());
      }
    }
  }
  
  async git(command) {
    // Wrap command to ensure no signing
    const wrappedCommand = GitWrapper.wrapCommand(`git ${command}`);
    // Use isolated git environment
    return await this.exec(wrappedCommand);
  }
  
  async exec(command) {
    // const startTime = Date.now();
    
    try {
      // Create isolated environment for git operations
      // Start with clean environment, only copy essentials
      const baseEnv = {
        PATH: process.env.PATH,
        NODE: process.env.NODE,
        npm_lifecycle_event: process.env.npm_lifecycle_event,
        npm_node_execpath: process.env.npm_node_execpath,
        // Git will be forced to use only our config
        // Override git config locations to prevent global config interference
        GIT_CONFIG_NOSYSTEM: '1',  // Ignore system git config
        GIT_CONFIG_GLOBAL: '/dev/null', // Point global config to nowhere
        GIT_CONFIG: path.join(this.dir, '.git', 'config'), // Force specific config file
        HOME: this.dir,            // Use test dir as HOME to avoid ~/.gitconfig
        USERPROFILE: this.dir,     // Windows equivalent of HOME
        XDG_CONFIG_HOME: this.dir, // Also override XDG config location
        // Disable any git hooks that might be globally configured
        GIT_HOOKS_PATH: '/dev/null',
        // Ensure consistent behavior
        GIT_TERMINAL_PROMPT: '0',  // Disable password prompts
        GIT_ASKPASS: '/bin/echo', // Provide empty password if asked
        SSH_ASKPASS: '/bin/echo', // Same for SSH
        // Disable GPG entirely
        GPG_TTY: '',
        GNUPGHOME: '/dev/null',    // Invalid GPG home directory
      };
      
      // Apply additional no-sign environment variables
      const testEnv = GitWrapper.getNoSignEnvironment(baseEnv);
      
      const { stdout, stderr } = await execAsync(command, { 
        cwd: this.dir,
        env: testEnv
      });
      
      const result = { 
        exitCode: 0, 
        stdout: stdout.trim(), 
        stderr: stderr.trim() 
      };
      
      
      return result;
    } catch (error) {
      // const duration = Date.now() - startTime;
      
      // Properly extract stdout and stderr from the error object
      let stdout = '';
      let stderr = '';
      
      if (error.stdout !== undefined) {
        stdout = error.stdout.toString().trim();
      }
      if (error.stderr !== undefined) {
        stderr = error.stderr.toString().trim();
      }
      
      // If no stderr from command, check if error has the actual command output
      if (!stderr && error.message) {
        // Extract the actual error from the message if it contains it
        const match = error.message.match(/Command failed:.*?\n([\s\S]*)/);
        if (match && match[1]) {
          stderr = match[1].trim();
        } else {
          stderr = error.message;
        }
      }
      
      const result = { 
        exitCode: error.code || 1, 
        stdout: stdout, 
        stderr: stderr 
      };
      
      
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