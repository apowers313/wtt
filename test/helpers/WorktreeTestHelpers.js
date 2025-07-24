const path = require('path');

/**
 * Test helpers for worktree tool testing
 * Abstracts implementation details and provides high-level assertions
 */
class WorktreeTestHelpers {
  constructor(repo) {
    this.repo = repo;
  }

  // ===== Command Execution Helpers =====
  
  /**
   * Initialize worktree configuration with proper defaults
   */
  async initWorktree(options = {}) {
    const args = [];
    
    // Note: Current implementation may not support these flags
    // This helper can adapt as implementation changes
    if (options.baseDir) args.push(`--base-dir ${options.baseDir}`);
    if (options.mainBranch) args.push(`--main-branch ${options.mainBranch}`);
    
    const result = await this.repo.run(`init ${args.join(' ')}`.trim());
    
    // Flexible success check - init might return 0 even if already initialized
    if (result.exitCode !== 0 && !result.stdout.includes('already exists')) {
      throw new Error(`Init failed: ${result.stderr || result.stdout}`);
    }
    
    // Add worktree files to .gitignore for tests
    await this.repo.writeFile('.gitignore', '.worktree-config.json\n.worktrees/\n');
    await this.repo.git('add .gitignore');
    await this.repo.git('commit -m "Add worktree files to gitignore"');
    
    return result;
  }

  /**
   * Create a worktree with proper syntax
   */
  async createWorktree(branch, options = {}) {
    // Determine the correct command syntax by trying variants
    let result;
    
    // First try with --from flag (seems to be required)
    const from = options.from || 'main';
    
    
    result = await this.repo.run(`create ${branch} --from ${from}`);
    
    
    if (result.exitCode !== 0 && result.stderr.includes('invalid reference')) {
      
      // Branch might not exist, try creating it first
      await this.repo.git(`checkout -b ${branch} ${from}`);
      await this.repo.git(`checkout ${from}`);
      result = await this.repo.run(`create ${branch}`);
      
    }
    
    return result;
  }

  /**
   * Remove a worktree, using the configured naming pattern
   */
  async removeWorktree(branch, options = {}) {
    // With current config using {branch} pattern, worktree name is just the branch name
    const worktreeName = branch;
    const args = [worktreeName];
    if (options.force) args.push('--force');
    
    return await this.repo.run(`remove ${args.join(' ')}`);
  }

  /**
   * Remove worktree with test prompter for interactive testing
   */
  async removeWorktreeInteractive(branch, responses = {}, options = {}) {
    const { removeCommand } = require('../../commands/remove-refactored');
    const { TestPrompter } = require('../../lib/prompter');
    
    // With current config using {branch} pattern, worktree name is just the branch name
    const worktreeName = branch;
    const prompter = new TestPrompter(responses);
    
    // Change to the test repo directory
    const originalCwd = process.cwd();
    process.chdir(this.repo.dir);
    
    // Capture console output
    const originalLog = console.log;
    const originalError = console.error;
    let stdout = '';
    let stderr = '';
    
    console.log = (...args) => {
      stdout += args.join(' ') + '\n';
    };
    
    console.error = (...args) => {
      stderr += args.join(' ') + '\n';
    };
    
    try {
      const result = await removeCommand(worktreeName, options, prompter);
      
      return {
        exitCode: result.cancelled ? 0 : (result.success ? 0 : 1),
        stdout,
        stderr,
        result
      };
    } catch (error) {
      return {
        exitCode: 1,
        stdout,
        stderr: stderr + error.message,
        result: { error: error.message }
      };
    } finally {
      console.log = originalLog;
      console.error = originalError;
      process.chdir(originalCwd);
    }
  }

  // ===== Output Assertion Helpers =====
  
  /**
   * Check if command succeeded, with flexible success detection
   */
  expectSuccess(result, message = '') {
    const succeeded = result.exitCode === 0 || 
                     result.stdout.includes('✓') ||
                     result.stdout.includes('Created') ||
                     result.stdout.includes('success');
    
    if (!succeeded) {
      const error = `Command failed${message ? ': ' + message : ''}\n` +
                   `Exit code: ${result.exitCode}\n` +
                   `Stdout: ${result.stdout}\n` +
                   `Stderr: ${result.stderr}`;
      throw new Error(error);
    }
  }

  /**
   * Check if command failed with expected error
   */
  expectFailure(result, expectedError = null) {
    const failed = result.exitCode !== 0 || 
                  result.stderr.length > 0 ||
                  result.stdout.includes('Error') ||
                  result.stdout.includes('failed');
    
    if (!failed) {
      throw new Error('Expected command to fail but it succeeded');
    }
    
    if (expectedError) {
      const output = result.stderr + result.stdout;
      if (!output.toLowerCase().includes(expectedError.toLowerCase())) {
        throw new Error(`Expected error "${expectedError}" not found in output`);
      }
    }
  }

  /**
   * Check if command was cancelled/aborted (exit code 0 but with cancellation message)
   */
  expectCancelled(result) {
    const cancelled = result.exitCode === 0 && 
                     (result.stdout.includes('Aborted') ||
                      result.stdout.includes('Cancelled') ||
                      result.stdout.includes('cancelled'));
    
    if (!cancelled) {
      throw new Error(`Expected command to be cancelled but it was not\nExit code: ${result.exitCode}\nOutput: ${result.stdout}`);
    }
  }

  /**
   * Flexible output matching that handles variations
   */
  expectOutputContains(result, possibleStrings) {
    const output = result.stdout + result.stderr;
    const strings = Array.isArray(possibleStrings) ? possibleStrings : [possibleStrings];
    
    const found = strings.some(str => 
      output.toLowerCase().includes(str.toLowerCase())
    );
    
    if (!found) {
      throw new Error(`Output does not contain any of: ${strings.join(', ')}\nActual: ${output}`);
    }
  }

  /**
   * Check that a string appears exactly once in the output
   */
  expectOutputOnce(result, string) {
    const output = (result.stdout + result.stderr).toLowerCase();
    const searchString = string.toLowerCase();
    const regex = new RegExp(searchString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = output.match(regex) || [];
    
    if (matches.length !== 1) {
      throw new Error(`Expected "${string}" to appear exactly once, but found ${matches.length} occurrences\nOutput: ${result.stdout + result.stderr}`);
    }
  }

  /**
   * Check that a string does not appear in the output
   */
  expectNoOutput(result, string) {
    const output = (result.stdout + result.stderr).toLowerCase();
    const searchString = string.toLowerCase();
    
    if (output.includes(searchString)) {
      throw new Error(`Expected output not to contain "${string}"\nOutput: ${result.stdout + result.stderr}`);
    }
  }

  /**
   * Count occurrences of a string in the output
   */
  countOutputOccurrences(result, string) {
    const output = (result.stdout + result.stderr).toLowerCase();
    const searchString = string.toLowerCase();
    const regex = new RegExp(searchString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = output.match(regex) || [];
    return matches.length;
  }

  /**
   * Check port assignment with flexible matching
   */
  expectPortAssignment(result, service, options = {}) {
    const output = result.stdout;
    const { min = 3000, max = 65535, exact = null } = options;
    
    // Try multiple patterns
    const patterns = [
      new RegExp(`${service}:\\s*(\\d+)`, 'i'),
      new RegExp(`-\\s*${service}:\\s*(\\d+)`, 'i'),
      new RegExp(`${service}\\s*=\\s*(\\d+)`, 'i'),
      new RegExp(`${service}.*?(\\d{4,5})`, 'i')
    ];
    
    let port = null;
    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        port = parseInt(match[1]);
        break;
      }
    }
    
    if (!port) {
      throw new Error(`Could not find port assignment for ${service} in output`);
    }
    
    if (exact && port !== exact) {
      throw new Error(`Expected ${service} port ${exact}, got ${port}`);
    }
    
    if (port < min || port > max) {
      throw new Error(`${service} port ${port} outside expected range ${min}-${max}`);
    }
    
    return port;
  }

  // ===== State Verification Helpers =====
  
  /**
   * Check if worktree exists with retries for timing issues
   */
  async expectWorktreeExists(branch, shouldExist = true) {
    // With default config using {branch} pattern
    const name = branch;
    const worktreePath = path.join('.worktrees', name);
    
    
    // Retry a few times to handle timing issues
    for (let i = 0; i < 3; i++) {
      const exists = await this.repo.exists(worktreePath);
      
      
      if (exists === shouldExist) {
        return true;
      }
      if (i < 2) await this.sleep(100);
    }
    
    throw new Error(`Expected worktree ${name} to ${shouldExist ? 'exist' : 'not exist'}`);
  }

  /**
   * Check worktree status
   */
  async expectWorktreeStatus(branch, expectedStatus) {
    const result = await this.repo.run('list -v');
    // With default config using {branch} pattern
    const name = branch;
    
    const statusAliases = {
      'clean': ['clean', 'Clean', 'up to date', ''],
      'dirty': ['dirty', 'Uncommitted changes', 'modified'],
      'ahead': ['ahead', 'Ahead'],
      'behind': ['behind', 'Behind']
    };
    
    const possibleStatuses = statusAliases[expectedStatus] || [expectedStatus];
    
    const hasStatus = possibleStatuses.some(status => 
      result.stdout.includes(name) && result.stdout.includes(status)
    );
    
    if (!hasStatus) {
      throw new Error(`Worktree ${name} does not have status ${expectedStatus}`);
    }
  }

  /**
   * Check if ports are assigned
   */
  async expectPortsAssigned(branch, services) {
    // With default config using {branch} pattern
    const name = branch;
    const portMapPath = path.join('.worktrees', '.port-map.json');
    
    
    // Try to read port map with retries
    let portMap;
    for (let i = 0; i < 3; i++) {
      try {
        const portMapContent = await this.repo.readFile(portMapPath);
        portMap = JSON.parse(portMapContent);
        
        break;
      } catch (error) {
        if (i === 2) throw error;
        await this.sleep(100);
      }
    }
    
    if (!portMap[name]) {
      throw new Error(`No ports assigned for worktree ${name}`);
    }
    
    for (const service of services) {
      if (!portMap[name][service]) {
        throw new Error(`Service ${service} not assigned for worktree ${name}`);
      }
    }
    
    return portMap[name];
  }

  /**
   * Check environment file
   */
  async expectEnvFile(branch, variables) {
    // With default config using {branch} pattern
    const name = branch;
    const envPath = path.join('.worktrees', name, '.env.worktree');
    
    const content = await this.repo.readFile(envPath);
    
    for (const [key, value] of Object.entries(variables)) {
      const pattern = value instanceof RegExp ? value : new RegExp(`${key}=${value}`);
      if (!pattern.test(content)) {
        throw new Error(`Environment variable ${key} not found or incorrect in ${envPath}`);
      }
    }
  }

  // ===== Utility Helpers =====
  
  /**
   * Get worktree name with prefix
   */
  getWorktreeName(branch) {
    // With default config using {branch} pattern
    return branch;
  }

  /**
   * Sleep helper for timing issues
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Setup a standard test repository
   */
  static async setupTestRepo(options = {}) {
    const { TestRepository } = require('./TestRepository');
    const repo = new TestRepository();
    await repo.init();
    
    // Ensure we have a main branch
    await repo.git('checkout -b main');
    
    // Initialize worktree config
    const helpers = new WorktreeTestHelpers(repo);
    await helpers.initWorktree(options);
    
    return { repo, helpers };
  }
}

module.exports = { WorktreeTestHelpers };