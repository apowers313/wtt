/**
 * Test Helpers for WTT
 * Provides utility methods for common test operations
 */

class TestHelpers {
  constructor(repo) {
    this.repo = repo;
  }

  /**
   * Wait for a condition to be true (with timeout)
   */
  async waitFor(condition, timeout = 1000) {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await this.sleep(10);
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute command and capture output
   */
  async executeCommand(command, args = []) {
    return await this.repo.run(command, args);
  }

  /**
   * Set up specific test scenario
   */
  async setupScenario(scenarioName, options = {}) {
    switch (scenarioName) {
      case 'dirty-worktree':
        this.repo.git.setDirtyState([
          { path: 'test.txt', working_dir: 'M' }
        ]);
        break;
      
      case 'merge-conflicts':
        this.repo.git.setConflicts([
          { file: 'test.txt', type: 'modify/modify' }
        ]);
        break;
      
      case 'detached-head':
        this.repo.git.setDetachedHead(options.commit);
        break;
      
      default:
        throw new Error(`Unknown scenario: ${scenarioName}`);
    }
  }

  /**
   * Create test files
   */
  createTestFiles(files) {
    Object.entries(files).forEach(([path, content]) => {
      this.repo.mockFS.writeFile(path, content);
    });
  }

  /**
   * Assert file content
   */
  assertFileContent(path, expectedContent) {
    const actual = this.repo.mockFS.readFile(path);
    if (actual !== expectedContent) {
      throw new Error(`File ${path} content mismatch.\nExpected: ${expectedContent}\nActual: ${actual}`);
    }
  }

  /**
   * Assert directory exists
   */
  assertDirectoryExists(path) {
    if (!this.repo.mockFS.exists(path)) {
      throw new Error(`Directory ${path} does not exist`);
    }
  }

  /**
   * Clean up test state
   */
  cleanup() {
    this.repo.git._reset();
    this.repo.mockFS._setState({ files: {}, directories: [] });
  }

  /**
   * Get current git state
   */
  getGitState() {
    return { ...this.repo.git.state };
  }

  /**
   * Verify command output format
   */
  verifyOutputFormat(result, command, expectedPattern) {
    const output = result.stdout + result.stderr;
    if (!output.match(expectedPattern)) {
      throw new Error(`Output for ${command} doesn't match expected pattern: ${expectedPattern}\nActual: ${output}`);
    }
  }
}

module.exports = TestHelpers;