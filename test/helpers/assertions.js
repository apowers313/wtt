/**
 * Common test assertions for worktree tool tests
 */
class TestAssertions {
  // Worktree assertions
  static worktreeExists(repo, name, shouldExist = true) {
    const path = `.worktrees/wt-${name}`;
    const exists = repo.mockFS.exists(path);
    if (shouldExist) {
      expect(exists).toBe(true);
    } else {
      expect(exists).toBe(false);
    }
  }

  static worktreeCount(repo, expectedCount) {
    const worktrees = repo.mockGit.state.worktrees;
    expect(worktrees.length).toBe(expectedCount);
  }

  // Output assertions
  static outputContains(result, text) {
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toContain(text);
  }

  static outputMatches(result, pattern) {
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toMatch(pattern);
  }

  static outputDoesNotContain(result, text) {
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).not.toContain(text);
  }

  static exitCode(result, expected) {
    expect(result.exitCode).toBe(expected);
  }

  static success(result) {
    expect(result.exitCode).toBe(0);
  }

  static failure(result) {
    expect(result.exitCode).not.toBe(0);
  }

  // Port assertions
  static portsAssigned(portMap, worktreeName, services) {
    const normalizedName = worktreeName.startsWith('wt-') ? worktreeName : `wt-${worktreeName}`;
    const ports = portMap[normalizedName];
    expect(ports).toBeDefined();
    services.forEach(service => {
      expect(ports[service]).toBeDefined();
      expect(ports[service]).toBeGreaterThan(0);
    });
  }

  static noPortsAssigned(portMap, worktreeName) {
    const normalizedName = worktreeName.startsWith('wt-') ? worktreeName : `wt-${worktreeName}`;
    const ports = portMap[normalizedName];
    expect(ports).toBeUndefined();
  }

  // Git state assertions
  static currentBranch(repo, expectedBranch) {
    expect(repo.mockGit.state.currentBranch).toBe(expectedBranch);
  }

  static hasCommit(repo, message) {
    const commits = repo.mockGit.state.commits;
    const found = commits.some(c => c.message === message);
    expect(found).toBe(true);
  }

  static branchExists(repo, branchName) {
    const branches = repo.mockGit.state.branches;
    expect(branches).toContain(branchName);
  }

  static isClean(repo) {
    expect(repo.mockGit.state.status.isClean).toBe(true);
  }

  static isDirty(repo) {
    expect(repo.mockGit.state.status.isClean).toBe(false);
  }

  // File assertions
  static fileExists(repo, path) {
    const exists = repo.mockFS.exists(path);
    expect(exists).toBe(true);
  }

  static fileContains(repo, path, content) {
    const fileContent = repo.mockFS.readFile(path);
    expect(fileContent).toContain(content);
  }

  // Config assertions
  static configContains(config, key, value) {
    expect(config).toHaveProperty(key, value);
  }

  // Array assertions
  static arrayContains(array, item) {
    expect(array).toContain(item);
  }

  static arrayLength(array, length) {
    expect(array).toHaveLength(length);
  }
}

module.exports = TestAssertions;