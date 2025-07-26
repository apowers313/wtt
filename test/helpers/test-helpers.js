/**
 * Common test helpers that work with MockRepository
 */
class TestHelpers {
  constructor(repo) {
    this.repo = repo;
  }

  /**
   * Check if a worktree exists
   * @param {string} name - Worktree name
   * @returns {boolean} True if exists
   */
  async worktreeExists(name) {
    const normalizedName = name.startsWith('wt-') ? name : `wt-${name}`;
    return this.repo.mockGit.state.worktrees.some(
      wt => wt.path.endsWith(normalizedName)
    );
  }

  /**
   * Get worktree count
   * @returns {number} Number of worktrees
   */
  getWorktreeCount() {
    return this.repo.mockGit.state.worktrees.length;
  }

  /**
   * Check if ports are assigned
   * @param {string} name - Worktree name
   * @param {string[]} services - Service names to check
   * @returns {boolean} True if all services have ports
   */
  portsAssigned(name, services) {
    const normalizedName = name.startsWith('wt-') ? name : `wt-${name}`;
    const ports = this.repo.portMap[normalizedName];
    if (!ports) return false;
    
    return services.every(service => 
      ports[service] && ports[service] > 0
    );
  }

  /**
   * Get assigned ports
   * @param {string} name - Worktree name
   * @returns {Object} Port assignments
   */
  getAssignedPorts(name) {
    const normalizedName = name.startsWith('wt-') ? name : `wt-${name}`;
    return this.repo.portMap[normalizedName] || null;
  }

  /**
   * Create a worktree with validation
   * @param {string} name - Worktree name
   * @returns {Object} Command result
   */
  async createWorktree(name) {
    return await this.repo.run(`create ${name}`);
  }

  /**
   * Remove a worktree
   * @param {string} name - Worktree name
   * @returns {Object} Command result
   */
  async removeWorktree(name) {
    return await this.repo.run(`remove ${name}`);
  }

  /**
   * List worktrees
   * @returns {Object} Command result
   */
  async listWorktrees() {
    return await this.repo.run('list');
  }

  /**
   * Merge a branch
   * @param {string} branch - Branch name
   * @returns {Object} Command result
   */
  async merge(branch) {
    return await this.repo.run(`merge ${branch || ''}`);
  }

  /**
   * Check command success
   * @param {Object} result - Command result
   * @returns {boolean} True if successful
   */
  isSuccess(result) {
    return result.exitCode === 0;
  }

  /**
   * Check command failure
   * @param {Object} result - Command result
   * @returns {boolean} True if failed
   */
  isFailure(result) {
    return result.exitCode !== 0;
  }

  /**
   * Expect command success (with assertion)
   * @param {Object} result - Command result
   */
  expectSuccess(result) {
    expect(result.exitCode).toBe(0);
    if (result.stderr) {
      expect(result.stderr).toBe('');
    }
  }

  /**
   * Expect command failure (with assertion)
   * @param {Object} result - Command result
   */
  expectFailure(result) {
    expect(result.exitCode).not.toBe(0);
  }

  /**
   * Expect worktree to exist
   * @param {string} name - Worktree name
   */
  async expectWorktreeExists(name) {
    const exists = await this.worktreeExists(name);
    expect(exists).toBe(true);
  }

  /**
   * Expect worktree not to exist
   * @param {string} name - Worktree name
   */
  async expectWorktreeNotExists(name) {
    const exists = await this.worktreeExists(name);
    expect(exists).toBe(false);
  }

  /**
   * Expect ports to be assigned
   * @param {string} name - Worktree name
   * @param {string[]} services - Service names
   */
  expectPortsAssigned(name, services) {
    const assigned = this.portsAssigned(name, services);
    expect(assigned).toBe(true);
  }

  /**
   * Expect output to contain text
   * @param {Object} result - Command result
   * @param {string} text - Text to find
   */
  expectOutputContains(result, text) {
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toContain(text);
  }

  /**
   * Create multiple worktrees
   * @param {string[]} names - Worktree names
   * @returns {Object[]} Command results
   */
  async createMultipleWorktrees(names) {
    const results = [];
    for (const name of names) {
      results.push(await this.createWorktree(name));
    }
    return results;
  }

  /**
   * Set up a conflict scenario
   * @param {string} branch1 - First branch name
   * @param {string} branch2 - Second branch name
   * @param {string} file - File to conflict on
   */
  async setupConflict(branch1, branch2, file = 'test.txt') {
    // Create first branch with changes
    await this.repo.createBranch(branch1);
    await this.repo.checkout(branch1);
    await this.repo.writeFile(file, `${branch1} content`);
    await this.repo.commit(`${branch1} changes`);
    
    // Create second branch with conflicting changes
    await this.repo.checkout('main');
    await this.repo.createBranch(branch2);
    await this.repo.checkout(branch2);
    await this.repo.writeFile(file, `${branch2} content`);
    await this.repo.commit(`${branch2} changes`);
    
    // Mark as conflicted
    this.repo.mockGit.state.status.conflicted = [file];
  }
}

module.exports = TestHelpers;