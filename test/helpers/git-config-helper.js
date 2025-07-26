/**
 * Helper to ensure git configuration is test-safe
 */

const path = require('path');
const fs = require('fs-extra');

class GitConfigHelper {
  /**
   * Get environment variables for isolated git testing
   * @param {string} testDir - The test directory to use as HOME
   * @returns {Object} Environment variables
   */
  static getTestEnvironment(testDir) {
    return {
      // Ignore all external git configs
      GIT_CONFIG_NOSYSTEM: '1',      // Ignore /etc/gitconfig
      GIT_CONFIG_NOGLOBAL: '1',      // Alternative way to ignore global config
      HOME: testDir,                 // Override HOME to avoid ~/.gitconfig
      USERPROFILE: testDir,          // Windows HOME equivalent
      HOMEDRIVE: '',                 // Clear Windows home drive
      HOMEPATH: testDir,             // Windows home path
      
      // Disable features that might interfere
      GIT_TERMINAL_PROMPT: '0',      // No password prompts
      GIT_ASKPASS: 'echo',           // Return empty password if asked
      GIT_SSH_COMMAND: 'echo',       // Disable SSH operations
      GIT_HOOKS_PATH: '/dev/null',   // Disable all hooks
      
      // Disable GPG signing
      GPG_TTY: '',                   // No GPG terminal
      GNUPGHOME: '/dev/null',        // Invalid GPG home
      
      // Ensure consistent behavior
      GIT_AUTHOR_NAME: 'Test User',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test User',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      
      // Disable any credential helpers
      GIT_CREDENTIAL_HELPER: '',
      
      // Use consistent timestamps for reproducible tests
      GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
    };
  }

  /**
   * Create a minimal git config for testing
   * @param {string} configPath - Path to write the config
   */
  static async createMinimalConfig(configPath) {
    const config = `[user]
    name = Test User
    email = test@example.com

[commit]
    gpgsign = false

[tag]
    gpgsign = false

[init]
    defaultBranch = main

[core]
    autocrlf = false
    filemode = false
`;
    
    await fs.writeFile(configPath, config);
  }

  /**
   * Setup git configuration for a test repository
   * @param {string} repoPath - Repository path
   * @param {Object} gitCommand - Function to execute git commands
   */
  static async setupTestGitConfig(repoPath, gitCommand) {
    // Core settings
    await gitCommand('config --local user.name "Test User"');
    await gitCommand('config --local user.email "test@example.com"');
    await gitCommand('config --local commit.gpgsign false');
    await gitCommand('config --local tag.gpgsign false');
    await gitCommand('config --local init.defaultBranch main');
    
    // Disable features that might cause issues
    await gitCommand('config --local core.autocrlf false');
    await gitCommand('config --local core.filemode false');
    await gitCommand('config --local pull.rebase false');
    await gitCommand('config --local merge.ff false');
    
    // Disable advice messages
    await gitCommand('config --local advice.detachedHead false');
    await gitCommand('config --local advice.pushNonFastForward false');
    await gitCommand('config --local advice.statusHints false');
    
    // Disable colors for consistent output
    await gitCommand('config --local color.ui false');
    
    // Disable pager
    await gitCommand('config --local core.pager cat');
  }

  /**
   * Verify that git is configured correctly for tests
   * @param {Object} gitCommand - Function to execute git commands
   * @returns {Object} Verification results
   */
  static async verifyTestConfig(gitCommand) {
    const issues = [];
    
    try {
      // Check critical settings
      const gpgSign = await gitCommand('config --get commit.gpgsign');
      if (gpgSign.stdout === 'true') {
        issues.push('commit.gpgsign is enabled - tests may fail');
      }
    } catch (e) {
      // Config not set is fine
    }
    
    try {
      const tagSign = await gitCommand('config --get tag.gpgsign');
      if (tagSign.stdout === 'true') {
        issues.push('tag.gpgsign is enabled - tests may fail');
      }
    } catch (e) {
      // Config not set is fine
    }
    
    try {
      const userName = await gitCommand('config --get user.name');
      if (!userName.stdout) {
        issues.push('user.name not set - commits may fail');
      }
    } catch (e) {
      issues.push('user.name not set - commits may fail');
    }
    
    try {
      const userEmail = await gitCommand('config --get user.email');
      if (!userEmail.stdout) {
        issues.push('user.email not set - commits may fail');
      }
    } catch (e) {
      issues.push('user.email not set - commits may fail');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

module.exports = GitConfigHelper;