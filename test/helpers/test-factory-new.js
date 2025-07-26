/**
 * Test Factory Pattern for WTT
 * Provides deterministic test scenarios without real git operations
 */

const MockRepository = require('./mock-repository-new');
const MockGit = require('./git-mock-new');
const TestHelpers = require('./test-helpers-new');

class TestFactory {
  /**
   * Create a test scenario with mocked git and filesystem
   */
  static async createScenario(type, options = {}) {
    const scenarios = {
      'clean-repo': () => this.cleanRepo(options),
      'with-worktree': () => this.repoWithWorktree(options),
      'merge-conflict': () => this.repoWithConflict(options),
      'multiple-worktrees': () => this.repoWithMultipleWorktrees(options),
      'dirty-worktree': () => this.repoWithUncommittedChanges(options),
      'detached-head': () => this.repoWithDetachedHead(options),
      'missing-branch': () => this.repoWithMissingBranch(options),
      'port-conflicts': () => this.repoWithPortConflicts(options)
    };
    
    if (!scenarios[type]) {
      throw new Error(`Unknown scenario: ${type}. Available: ${Object.keys(scenarios).join(', ')}`);
    }
    
    return await scenarios[type]();
  }

  /**
   * Clean repository with no worktrees
   */
  static async cleanRepo(options = {}) {
    const repo = new MockRepository({
      gitRoot: options.gitRoot || '/tmp/test-repo',
      branches: options.branches || ['main', 'develop'],
      currentBranch: options.currentBranch || 'main',
      clean: true
    });
    
    await repo.init();
    
    return { 
      repo, 
      git: repo.git,
      helpers: new TestHelpers(repo),
      pathManager: repo.pathManager,
      output: repo.output
    };
  }

  /**
   * Repository with one worktree
   */
  static async repoWithWorktree(options = {}) {
    const { repo, git, helpers, pathManager, output } = await this.cleanRepo(options);
    
    const worktreeName = options.worktreeName || 'feature';
    const branchName = options.branchName || worktreeName;
    
    // Create branch and worktree
    await repo.createBranch(branchName);
    await repo.createWorktree(worktreeName, branchName);
    
    return { 
      repo, 
      git, 
      helpers, 
      pathManager, 
      output,
      worktreeName,
      branchName
    };
  }

  /**
   * Repository with conflicting branches
   */
  static async repoWithConflict(options = {}) {
    const { repo, git, helpers, pathManager, output } = await this.cleanRepo(options);
    
    const fileName = options.fileName || 'test.txt';
    const mainContent = options.mainContent || 'main branch content';
    const featureContent = options.featureContent || 'feature branch content';
    
    // Create conflicting changes
    await repo.createBranch('feature');
    await repo.writeFile(fileName, featureContent);
    await repo.commit('Feature change');
    
    await repo.checkout('main');
    await repo.writeFile(fileName, mainContent);
    await repo.commit('Main change');
    
    // Set up merge conflict state
    repo.git._setState({
      conflicts: [{ file: fileName, type: 'modify/modify' }],
      mergeInProgress: true
    });
    
    return { 
      repo, 
      git, 
      helpers, 
      pathManager, 
      output,
      conflictFile: fileName,
      branches: ['main', 'feature']
    };
  }

  /**
   * Repository with multiple worktrees
   */
  static async repoWithMultipleWorktrees(options = {}) {
    const { repo, git, helpers, pathManager, output } = await this.cleanRepo(options);
    
    const worktrees = options.worktrees || [
      { name: 'feature-auth', branch: 'feature-auth' },
      { name: 'bug-fix', branch: 'bug-fix' },
      { name: 'experimental', branch: 'experimental' }
    ];
    
    // Create all worktrees
    for (const wt of worktrees) {
      await repo.createBranch(wt.branch);
      await repo.createWorktree(wt.name, wt.branch);
    }
    
    return { 
      repo, 
      git, 
      helpers, 
      pathManager, 
      output,
      worktrees: worktrees.map(wt => wt.name)
    };
  }

  /**
   * Repository with uncommitted changes
   */
  static async repoWithUncommittedChanges(options = {}) {
    const { repo, git, helpers, pathManager, output } = await this.repoWithWorktree(options);
    
    const changes = options.changes || [
      { file: 'modified.txt', status: 'modified' },
      { file: 'new.txt', status: 'added' },
      { file: 'deleted.txt', status: 'deleted' }
    ];
    
    // Set up dirty state
    repo.git._setState({
      status: { 
        isClean: () => false,
        files: changes
      }
    });
    
    return { 
      repo, 
      git, 
      helpers, 
      pathManager, 
      output,
      changes
    };
  }

  /**
   * Repository in detached HEAD state
   */
  static async repoWithDetachedHead(options = {}) {
    const { repo, git, helpers, pathManager, output } = await this.cleanRepo(options);
    
    // Set detached HEAD state
    repo.git._setState({
      currentBranch: 'HEAD',
      detachedHead: true,
      currentCommit: options.commit || 'abc123'
    });
    
    return { 
      repo, 
      git, 
      helpers, 
      pathManager, 
      output,
      detachedAt: options.commit || 'abc123'
    };
  }

  /**
   * Repository with missing branch
   */
  static async repoWithMissingBranch(options = {}) {
    const { repo, git, helpers, pathManager, output } = await this.cleanRepo(options);
    
    const missingBranch = options.missingBranch || 'non-existent';
    
    // Create worktree reference but no actual branch
    await repo.createWorktree('broken-worktree', missingBranch, { skipBranchCreation: true });
    
    return { 
      repo, 
      git, 
      helpers, 
      pathManager, 
      output,
      missingBranch,
      brokenWorktree: 'broken-worktree'
    };
  }

  /**
   * Repository with port conflicts
   */
  static async repoWithPortConflicts(options = {}) {
    const { repo, git, helpers, pathManager, output } = await this.repoWithMultipleWorktrees(options);
    
    const conflictedPorts = options.conflictedPorts || [3001, 6007, 8081];
    
    // Set up port conflicts
    repo.portManager._setState({
      conflicts: conflictedPorts,
      assignedPorts: {
        'feature-auth': { vite: 3001, storybook: 6007 },
        'bug-fix': { vite: 3001, storybook: 6008 }, // Conflict on vite port
        'experimental': { vite: 3002, storybook: 6007 } // Conflict on storybook port
      }
    });
    
    return { 
      repo, 
      git, 
      helpers, 
      pathManager, 
      output,
      conflictedPorts
    };
  }

  /**
   * Create custom scenario with specific configuration
   */
  static async custom(config) {
    const repo = new MockRepository(config);
    await repo.init();
    
    // Apply custom state
    if (config.gitState) {
      repo.git._setState(config.gitState);
    }
    
    if (config.filesystemState) {
      repo.mockFS._setState(config.filesystemState);
    }
    
    if (config.portState) {
      repo.portManager._setState(config.portState);
    }
    
    return {
      repo,
      git: repo.git,
      helpers: new TestHelpers(repo),
      pathManager: repo.pathManager,
      output: repo.output
    };
  }

  /**
   * Quick scenario creation for common test patterns
   */
  static async quickScenario(pattern) {
    const patterns = {
      // Simple creation test
      'create-test': () => this.cleanRepo(),
      
      // Simple merge test
      'merge-test': () => this.repoWithWorktree({ worktreeName: 'to-merge' }),
      
      // Conflict resolution test
      'conflict-test': () => this.repoWithConflict(),
      
      // List/status test
      'list-test': () => this.repoWithMultipleWorktrees(),
      
      // Error handling test
      'error-test': () => this.repoWithDetachedHead(),
      
      // Port management test
      'port-test': () => this.repoWithPortConflicts()
    };
    
    if (!patterns[pattern]) {
      throw new Error(`Unknown quick pattern: ${pattern}`);
    }
    
    return await patterns[pattern]();
  }
}

module.exports = TestFactory;