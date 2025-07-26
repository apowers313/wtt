/**
 * Alternative fast git initialization using a minimal config file
 * This can be used when template copying isn't suitable
 */

const fs = require('fs-extra');
const path = require('path');

class FastGitInit {
  /**
   * Create a minimal .git/config file directly
   * This is faster than running multiple git config commands
   */
  static async createGitConfig(repoPath) {
    const gitDir = path.join(repoPath, '.git');
    const configPath = path.join(gitDir, 'config');
    
    const config = `[core]
	repositoryformatversion = 0
	filemode = false
	bare = false
	logallrefupdates = true
	autocrlf = false
	pager = cat

[user]
	name = Test User
	email = test@example.com

[commit]
	gpgsign = false

[tag]
	gpgsign = false

[init]
	defaultBranch = main

[advice]
	detachedHead = false
	pushNonFastForward = false
	statusHints = false

[color]
	ui = false

[merge]
	ff = false

[pull]
	rebase = false
`;

    await fs.writeFile(configPath, config);
  }

  /**
   * Create all necessary git files for a minimal repo
   * This bypasses git init entirely
   */
  static async createMinimalGitRepo(repoPath) {
    const gitDir = path.join(repoPath, '.git');
    
    // Create directory structure
    await fs.ensureDir(path.join(gitDir, 'objects', 'info'));
    await fs.ensureDir(path.join(gitDir, 'objects', 'pack'));
    await fs.ensureDir(path.join(gitDir, 'refs', 'heads'));
    await fs.ensureDir(path.join(gitDir, 'refs', 'tags'));
    await fs.ensureDir(path.join(gitDir, 'hooks'));
    await fs.ensureDir(path.join(gitDir, 'info'));

    // Create essential files
    await fs.writeFile(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    await fs.writeFile(path.join(gitDir, 'description'), 'Unnamed repository; edit this file to name the repository.\n');
    await fs.writeFile(path.join(gitDir, 'info', 'exclude'), '# git ls-files --others --exclude-from=.git/info/exclude\n');
    
    // Create config
    await this.createGitConfig(repoPath);
    
    // Create empty refs for main branch (will be updated on first commit)
    await fs.writeFile(path.join(gitDir, 'refs', 'heads', 'main'), '');
  }

  /**
   * Write all git configs at once using a single command
   * This is faster than multiple git config calls
   */
  static async batchWriteConfig(gitCommand, configs) {
    // Create a temporary config file
    const configLines = [];
    
    for (const [section, settings] of Object.entries(configs)) {
      configLines.push(`[${section}]`);
      for (const [key, value] of Object.entries(settings)) {
        configLines.push(`\t${key} = ${value}`);
      }
    }
    
    const configContent = configLines.join('\n');
    
    // Write directly to the git config
    await gitCommand(`config --local --replace-all include.path /dev/null`); // Clear includes
    
    // Then append our config
    const configFile = '.git/config';
    await fs.appendFile(configFile, '\n' + configContent);
  }
}

module.exports = FastGitInit;