/**
 * Test Assertions for WTT
 * Provides consistent assertion methods for common test scenarios
 */

class TestAssertions {
  /**
   * Assert that a worktree exists
   */
  static worktreeExists(repo, name, shouldExist = true) {
    const path = `.worktrees/wt-${name}`;
    const exists = repo.mockFS.exists(path);
    
    if (shouldExist) {
      expect(exists).toBe(true);
    } else {
      expect(exists).toBe(false);
    }
  }

  /**
   * Assert worktree count
   */
  static worktreeCount(repo, expectedCount) {
    const worktrees = repo.git.state.worktrees;
    expect(worktrees.length).toBe(expectedCount);
  }

  /**
   * Assert that output contains specific text
   */
  static outputContains(result, text) {
    const output = this._getFullOutput(result);
    expect(output).toContain(text);
  }

  /**
   * Assert that output matches pattern
   */
  static outputMatches(result, pattern) {
    const output = this._getFullOutput(result);
    expect(output).toMatch(pattern);
  }

  /**
   * Assert specific exit code
   */
  static exitCode(result, expected) {
    expect(result.exitCode).toBe(expected);
  }

  /**
   * Assert that ports are assigned correctly
   */
  static portsAssigned(portMap, worktreeName, services) {
    const ports = portMap[worktreeName];
    expect(ports).toBeDefined();
    
    services.forEach(service => {
      expect(ports[service]).toBeDefined();
      expect(ports[service]).toBeGreaterThan(0);
      expect(typeof ports[service]).toBe('number');
    });
  }

  /**
   * Assert git repository state
   */
  static currentBranch(repo, expectedBranch) {
    expect(repo.git.state.currentBranch).toBe(expectedBranch);
  }

  /**
   * Assert that a commit exists
   */
  static hasCommit(repo, message) {
    const commits = repo.git.state.commits;
    const found = commits.some(c => c.message === message);
    expect(found).toBe(true);
  }

  /**
   * Assert git method was called
   */
  static gitMethodCalled(git, method, times = 1) {
    const callCount = git._getCallCount(method);
    expect(callCount).toBe(times);
  }

  /**
   * Assert git method was called with specific arguments
   */
  static gitMethodCalledWith(git, method, expectedArgs) {
    const lastCall = git._getLastCall(method);
    expect(lastCall).toBeDefined();
    expect(lastCall.args).toEqual(expectedArgs);
  }

  /**
   * Assert that validation passed
   */
  static validationPassed(validationResult) {
    expect(Array.isArray(validationResult)).toBe(true);
    expect(validationResult.length).toBe(0);
  }

  /**
   * Assert that validation failed with specific errors
   */
  static validationFailed(validationResult, expectedErrors) {
    expect(Array.isArray(validationResult)).toBe(true);
    expect(validationResult.length).toBeGreaterThan(0);
    
    if (expectedErrors) {
      expectedErrors.forEach(error => {
        expect(validationResult).toContain(error);
      });
    }
  }

  /**
   * Assert file exists in mock filesystem
   */
  static fileExists(mockFS, filePath, shouldExist = true) {
    const exists = mockFS.exists(filePath);
    expect(exists).toBe(shouldExist);
  }

  /**
   * Assert file content in mock filesystem
   */
  static fileContent(mockFS, filePath, expectedContent) {
    const content = mockFS.readFile(filePath);
    expect(content).toBe(expectedContent);
  }

  /**
   * Assert file content contains text
   */
  static fileContentContains(mockFS, filePath, text) {
    const content = mockFS.readFile(filePath);
    expect(content).toContain(text);
  }

  /**
   * Assert directory structure
   */
  static directoryStructure(mockFS, basePath, expectedStructure) {
    Object.entries(expectedStructure).forEach(([path, expectation]) => {
      const fullPath = `${basePath}/${path}`;
      
      if (typeof expectation === 'boolean') {
        // Simple existence check
        expect(mockFS.exists(fullPath)).toBe(expectation);
      } else if (typeof expectation === 'string') {
        // File content check
        expect(mockFS.readFile(fullPath)).toBe(expectation);
      } else if (typeof expectation === 'object') {
        // Nested directory
        this.directoryStructure(mockFS, fullPath, expectation);
      }
    });
  }

  /**
   * Assert port conflicts
   */
  static portConflicts(portManager, expectedConflicts) {
    const conflicts = portManager.getConflicts();
    expect(conflicts).toEqual(expectedConflicts);
  }

  /**
   * Assert no port conflicts
   */
  static noPortConflicts(portManager) {
    const conflicts = portManager.getConflicts();
    expect(conflicts.length).toBe(0);
  }

  /**
   * Assert output format (for testing new concise output)
   */
  static conciseOutput(result, maxLines = 3) {
    const output = this._getFullOutput(result);
    const lines = output.split('\n').filter(line => line.trim() !== '');
    expect(lines.length).toBeLessThanOrEqual(maxLines);
  }

  /**
   * Assert verbose output has more detail
   */
  static verboseOutput(result, minLines = 4) {
    const output = this._getFullOutput(result);
    const lines = output.split('\n').filter(line => line.trim() !== '');
    expect(lines.length).toBeGreaterThanOrEqual(minLines);
  }

  /**
   * Assert output follows WTT format pattern
   */
  static wttOutputFormat(result, command) {
    const output = this._getFullOutput(result);
    const lines = output.split('\n').filter(line => line.trim() !== '');
    
    // Should start with "wt <command>:"
    expect(lines[0]).toMatch(new RegExp(`^wt ${command}:`));
  }

  /**
   * Assert error message format
   */
  static errorFormat(result, command, errorText) {
    const output = this._getFullOutput(result);
    expect(output).toContain(`wt ${command}: error: ${errorText}`);
  }

  /**
   * Assert success message format
   */
  static successFormat(result, command, successText) {
    const output = this._getFullOutput(result);
    expect(output).toContain(`wt ${command}: ${successText}`);
  }

  /**
   * Assert command completed within time limit
   */
  static completedWithinTime(startTime, maxDurationMs) {
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(maxDurationMs);
  }

  /**
   * Assert deterministic behavior (same input, same output)
   */
  static deterministicBehavior(operation, runs = 3) {
    const results = [];
    
    for (let i = 0; i < runs; i++) {
      results.push(operation());
    }
    
    // All results should be identical
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  }

  /**
   * Custom assertion for path equality (handles different path formats)
   */
  static pathEquals(actualPath, expectedPath) {
    const normalize = (p) => p.replace(/\\/g, '/').replace(/\/+/g, '/');
    expect(normalize(actualPath)).toBe(normalize(expectedPath));
  }

  /**
   * Assert configuration state
   */
  static configState(config, expectedValues) {
    Object.entries(expectedValues).forEach(([key, expectedValue]) => {
      expect(config[key]).toEqual(expectedValue);
    });
  }

  /**
   * Assert environment variables in .env.worktree
   */
  static envWorktreeVars(mockFS, worktreePath, expectedVars) {
    const envPath = `${worktreePath}/.env.worktree`;
    const content = mockFS.readFile(envPath);
    
    Object.entries(expectedVars).forEach(([key, value]) => {
      expect(content).toContain(`${key}=${value}`);
    });
  }

  /**
   * Helper method to get full output from various result formats
   */
  static _getFullOutput(result) {
    if (typeof result === 'string') {
      return result;
    }
    
    if (result && typeof result === 'object') {
      if (result.stdout !== undefined && result.stderr !== undefined) {
        return result.stdout + result.stderr;
      }
      
      if (result.output !== undefined) {
        return result.output;
      }
      
      if (Array.isArray(result.lines)) {
        return result.lines.join('\n');
      }
    }
    
    return String(result);
  }

  /**
   * Snapshot testing helper
   */
  static matchesSnapshot(result, snapshotName) {
    const output = this._getFullOutput(result);
    expect(output).toMatchSnapshot(snapshotName);
  }

  /**
   * Assert clean test environment (no side effects)
   */
  static cleanTestEnvironment(beforeState, afterState) {
    expect(afterState).toEqual(beforeState);
  }
}

module.exports = TestAssertions;