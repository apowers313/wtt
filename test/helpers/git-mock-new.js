/**
 * Git Mock for deterministic testing
 * Simulates git operations without actual git commands
 */

class GitMock {
  constructor(initialState = {}) {
    this.state = {
      branches: ['main', 'develop'],
      currentBranch: 'main',
      worktrees: [],
      commits: [],
      status: { 
        isClean: () => true,
        files: [],
        conflicted: []
      },
      detachedHead: false,
      mergeInProgress: false,
      conflicts: [],
      remotes: ['origin'],
      ...initialState
    };
    
    // Track method calls for testing
    this.calls = [];
  }

  /**
   * Mock git.checkIsRepo()
   */
  async checkIsRepo() {
    this._recordCall('checkIsRepo');
    return this.state.isRepo !== false;
  }

  /**
   * Mock git.status()
   */
  async status() {
    this._recordCall('status');
    return this.state.status;
  }

  /**
   * Mock git.branch()
   */
  async branch(options = []) {
    this._recordCall('branch', options);
    
    if (options.includes('--all')) {
      return {
        all: [
          ...this.state.branches,
          ...this.state.branches.map(b => `remotes/origin/${b}`)
        ].map(name => ({ name }))
      };
    }
    
    return {
      all: this.state.branches.map(name => ({ name })),
      current: this.state.currentBranch
    };
  }

  /**
   * Mock git.revparse()
   */
  async revparse(args) {
    this._recordCall('revparse', args);
    
    if (args.includes('--abbrev-ref') && args.includes('HEAD')) {
      return this.state.detachedHead ? 'HEAD' : this.state.currentBranch;
    }
    
    if (args.includes('--show-toplevel')) {
      return this.state.gitRoot || '/tmp/test-repo';
    }
    
    return 'mock-sha';
  }

  /**
   * Mock git.checkout()
   */
  async checkout(branch) {
    this._recordCall('checkout', branch);
    
    if (!this.state.branches.includes(branch)) {
      throw new Error(`pathspec '${branch}' did not match any file(s) known to git`);
    }
    
    this.state.currentBranch = branch;
    this.state.detachedHead = false;
    return `Switched to branch '${branch}'`;
  }

  /**
   * Mock git.merge()
   */
  async merge(branch) {
    this._recordCall('merge', branch);
    
    if (this.state.conflicts.length > 0) {
      const error = new Error('CONFLICT (content): Merge conflict');
      error.git = { conflicts: this.state.conflicts };
      throw error;
    }
    
    return `Merge made by the 'recursive' strategy.`;
  }

  /**
   * Mock git.raw() for various commands
   */
  async raw(args) {
    this._recordCall('raw', args);
    
    const command = args[0];
    
    switch (command) {
      case 'worktree':
        return this._handleWorktreeCommand(args.slice(1));
      
      case '-C':
        // Handle git -C <path> <command>
        const path = args[1];
        const subCommand = args.slice(2);
        return this.raw(subCommand);
      
      case 'rev-parse':
        return this.revparse(args.slice(1));
      
      case '--version':
        return 'git version 2.34.1';
      
      default:
        return `Mock result for: ${args.join(' ')}`;
    }
  }

  /**
   * Mock git.cwd() - change working directory
   */
  async cwd(directory) {
    this._recordCall('cwd', directory);
    this.state.currentDirectory = directory;
    return this;
  }

  /**
   * Handle worktree-specific commands
   */
  _handleWorktreeCommand(args) {
    const subCommand = args[0];
    
    switch (subCommand) {
      case 'list':
        if (args.includes('--porcelain')) {
          return this.state.worktrees
            .map(wt => `worktree ${wt.path}\nbranch ${wt.branch}`)
            .join('\n\n');
        }
        return this.state.worktrees
          .map(wt => `${wt.path} ${wt.branch}`)
          .join('\n');
      
      case 'add':
        const [, worktreePath, ...addArgs] = args;
        let branch;
        
        if (addArgs.includes('-b')) {
          const branchIndex = addArgs.indexOf('-b');
          branch = addArgs[branchIndex + 1];
          // Add new branch to state
          if (!this.state.branches.includes(branch)) {
            this.state.branches.push(branch);
          }
        } else {
          branch = addArgs[0] || 'main';
        }
        
        // Add worktree to state
        this.state.worktrees.push({
          path: worktreePath,
          branch: branch
        });
        
        return `Preparing worktree (new branch '${branch}')`;
      
      case 'remove':
        const [, removePath] = args;
        this.state.worktrees = this.state.worktrees.filter(wt => wt.path !== removePath);
        return `Removed worktree '${removePath}'`;
      
      default:
        return `Mock worktree result for: ${args.join(' ')}`;
    }
  }

  /**
   * Test helper methods
   */
  _setState(newState) {
    Object.assign(this.state, newState);
  }

  _reset() {
    this.state = {
      branches: ['main', 'develop'],
      currentBranch: 'main',
      worktrees: [],
      commits: [],
      status: { 
        isClean: () => true,
        files: [],
        conflicted: []
      },
      detachedHead: false,
      mergeInProgress: false,
      conflicts: [],
      remotes: ['origin']
    };
    this.calls = [];
  }

  _recordCall(method, args = []) {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  _getCallCount(method) {
    return this.calls.filter(call => call.method === method).length;
  }

  _getLastCall(method) {
    const calls = this.calls.filter(call => call.method === method);
    return calls[calls.length - 1];
  }

  _getAllCalls() {
    return [...this.calls];
  }

  // Convenience methods for setting up test scenarios
  addBranch(branchName) {
    if (!this.state.branches.includes(branchName)) {
      this.state.branches.push(branchName);
    }
  }

  addWorktree(path, branch) {
    this.state.worktrees.push({ path, branch });
    this.addBranch(branch);
  }

  setConflicts(conflicts) {
    this.state.conflicts = conflicts;
    this.state.status = {
      isClean: () => false,
      files: conflicts.map(c => ({ path: c.file, working_dir: 'M', index: 'M' })),
      conflicted: conflicts.map(c => c.file)
    };
  }

  setDirtyState(files) {
    this.state.status = {
      isClean: () => false,
      files: files,
      conflicted: []
    };
  }

  setDetachedHead(commit = 'abc123') {
    this.state.detachedHead = true;
    this.state.currentBranch = 'HEAD';
    this.state.currentCommit = commit;
  }
}

module.exports = GitMock;