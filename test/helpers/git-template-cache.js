/**
 * Cache for git template repository to speed up test initialization
 */

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class GitTemplateCache {
  constructor() {
    this.templatePath = null;
    this.isInitialized = false;
  }

  /**
   * Get or create the template repository
   * This is called once and reused for all tests
   */
  async getTemplatePath() {
    if (this.isInitialized && this.templatePath && await fs.pathExists(this.templatePath)) {
      return this.templatePath;
    }

    await this.createTemplate();
    return this.templatePath;
  }

  /**
   * Create the template repository with all configs
   */
  async createTemplate() {
    // Create template in a stable location
    const tmpBase = path.join(os.tmpdir(), 'wtt-test-templates');
    await fs.ensureDir(tmpBase);
    
    // Use a versioned template name so we can update it if needed
    const templateVersion = 'v1';
    this.templatePath = path.join(tmpBase, `git-template-${templateVersion}`);
    
    // Check if template already exists from previous run
    if (await fs.pathExists(path.join(this.templatePath, '.git', 'config'))) {
      this.isInitialized = true;
      return;
    }

    // Remove old template if it exists
    await fs.remove(this.templatePath);
    await fs.ensureDir(this.templatePath);

    // Create the template repository
    console.log('Creating git template repository (one-time setup)...');
    
    // Initialize with our test environment
    const testEnv = {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      HOME: this.templatePath,
      USERPROFILE: this.templatePath,
    };

    // Helper to run git commands in template
    const gitExec = async (cmd) => {
      // Force no signing for all git operations
      const forceNoSign = cmd.startsWith('commit') || cmd.startsWith('tag') 
        ? `--no-gpg-sign ${cmd}` 
        : cmd;
        
      return await execAsync(`git ${forceNoSign}`, {
        cwd: this.templatePath,
        env: testEnv
      });
    };

    // Initialize repository
    await gitExec('init');
    
    // Set all the configs we need
    await gitExec('config --local user.name "Test User"');
    await gitExec('config --local user.email "test@example.com"');
    await gitExec('config --local commit.gpgsign false');
    await gitExec('config --local tag.gpgsign false');
    await gitExec('config --local core.autocrlf false');
    await gitExec('config --local core.filemode false');
    await gitExec('config --local init.defaultBranch main');
    await gitExec('config --local advice.detachedHead false');
    await gitExec('config --local advice.pushNonFastForward false');
    await gitExec('config --local advice.statusHints false');
    await gitExec('config --local color.ui false');
    await gitExec('config --local core.pager cat');
    await gitExec('config --local merge.ff false');
    await gitExec('config --local pull.rebase false');

    // Create initial commit
    await fs.writeFile(path.join(this.templatePath, 'README.md'), '# Test Repository');
    await gitExec('add .');
    await gitExec('commit --no-gpg-sign -m "Initial commit"');
    
    // Try to rename branch if needed
    try {
      await gitExec('branch -m master main');
    } catch (e) {
      // Already on main
    }

    this.isInitialized = true;
  }

  /**
   * Copy template to create a new test repository
   * This is much faster than running all the git config commands
   */
  async copyToDirectory(targetDir) {
    const templatePath = await this.getTemplatePath();
    
    // Copy the entire template directory
    await fs.copy(templatePath, targetDir, {
      // Don't follow symlinks
      dereference: false,
      // Overwrite if exists
      overwrite: true,
    });

    // Update the git directory path in the config
    // Git needs absolute paths in some configs
    const gitConfigPath = path.join(targetDir, '.git', 'config');
    if (await fs.pathExists(gitConfigPath)) {
      let config = await fs.readFile(gitConfigPath, 'utf8');
      // Replace any absolute paths that might reference the template
      config = config.replace(new RegExp(templatePath, 'g'), targetDir);
      await fs.writeFile(gitConfigPath, config);
    }
  }

  /**
   * Clean up template (called in global teardown)
   */
  async cleanup() {
    if (this.templatePath && await fs.pathExists(this.templatePath)) {
      try {
        await fs.remove(this.templatePath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    this.templatePath = null;
    this.isInitialized = false;
  }
}

// Singleton instance
const gitTemplateCache = new GitTemplateCache();

module.exports = gitTemplateCache;