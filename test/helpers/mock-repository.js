const path = require('path');

/**
 * Mock repository for fast, deterministic tests
 * Replaces actual git operations with in-memory state
 */
class MockRepository {
  constructor() {
    this.dir = '/mock/repo';
    this.mockGit = {
      state: {
        branches: ['main'],
        currentBranch: 'main',
        worktrees: [],
        commits: [{ hash: 'abc123', message: 'Initial commit', branch: 'main' }],
        status: {
          isClean: true,
          modified: [],
          added: [],
          deleted: [],
          conflicted: []
        },
        tags: [],
        remotes: ['origin'],
        stashes: []
      }
    };
    
    this.mockFS = {
      files: new Map(),
      exists: (filePath) => this.mockFS.files.has(filePath),
      readFile: (filePath) => this.mockFS.files.get(filePath),
      writeFile: (filePath, content) => {
        this.mockFS.files.set(filePath, content);
      },
      remove: (filePath) => {
        this.mockFS.files.delete(filePath);
      },
      mkdir: (dirPath) => {
        // Mock implementation - just track that directory was created
        this.mockFS.files.set(dirPath + '/.gitkeep', '');
      }
    };
    
    this.portMap = {};
    this.config = {
      worktreeDir: '.worktrees',
      mainBranch: 'main'
    };
  }

  async init() {
    // Initialize basic repo structure
    this.mockFS.writeFile('.git/config', '[core]\nrepositoryformatversion = 0');
    this.mockFS.writeFile('README.md', '# Mock Repository');
    return this;
  }

  async run(command) {
    const args = command.split(' ');
    const cmd = args[0];
    
    // Mock command execution
    const result = {
      stdout: '',
      stderr: '',
      exitCode: 0
    };
    
    try {
      switch (cmd) {
        case 'create':
          result.stdout = await this._mockCreate(args.slice(1));
          break;
        case 'list':
          result.stdout = await this._mockList(args.slice(1));
          break;
        case 'remove':
          result.stdout = await this._mockRemove(args.slice(1));
          break;
        case 'merge':
          result.stdout = await this._mockMerge(args.slice(1));
          break;
        default:
          result.stderr = `Unknown command: ${cmd}`;
          result.exitCode = 1;
      }
    } catch (error) {
      result.stderr = error.message;
      result.exitCode = 1;
    }
    
    return result;
  }

  async _mockCreate(args) {
    const branchName = args[0];
    if (!branchName) {
      throw new Error('Branch name required');
    }
    
    // Check if branch already exists
    if (this.mockGit.state.branches.includes(branchName)) {
      throw new Error(`Branch '${branchName}' already exists`);
    }
    
    // Create branch and worktree
    this.mockGit.state.branches.push(branchName);
    const worktreePath = `.worktrees/wt-${branchName}`;
    this.mockGit.state.worktrees.push({
      path: worktreePath,
      branch: branchName,
      HEAD: 'abc123'
    });
    
    // Create worktree directory
    this.mockFS.mkdir(worktreePath);
    
    // Assign ports
    this.portMap[`wt-${branchName}`] = {
      vite: 3000 + this.mockGit.state.worktrees.length,
      storybook: 6006 + this.mockGit.state.worktrees.length
    };
    
    return `Created worktree 'wt-${branchName}' at ${worktreePath}`;
  }

  async _mockList(args) {
    if (this.mockGit.state.worktrees.length === 0) {
      return 'No worktrees found';
    }
    
    return this.mockGit.state.worktrees
      .map(wt => `${wt.branch} -> ${wt.path}`)
      .join('\n');
  }

  async _mockRemove(args) {
    const name = args[0];
    if (!name) {
      throw new Error('Worktree name required');
    }
    
    const worktreeIndex = this.mockGit.state.worktrees.findIndex(
      wt => wt.branch === name || wt.path.endsWith(`wt-${name}`)
    );
    
    if (worktreeIndex === -1) {
      throw new Error(`Worktree '${name}' not found`);
    }
    
    const worktree = this.mockGit.state.worktrees[worktreeIndex];
    this.mockGit.state.worktrees.splice(worktreeIndex, 1);
    
    // Remove from branches if not main
    const branchIndex = this.mockGit.state.branches.indexOf(worktree.branch);
    if (branchIndex !== -1 && worktree.branch !== 'main') {
      this.mockGit.state.branches.splice(branchIndex, 1);
    }
    
    // Release ports
    delete this.portMap[`wt-${worktree.branch}`];
    
    return `Removed worktree '${name}'`;
  }

  async _mockMerge(args) {
    const branchName = args[0] || this.mockGit.state.currentBranch;
    
    if (!this.mockGit.state.branches.includes(branchName)) {
      throw new Error(`Branch '${branchName}' not found`);
    }
    
    if (branchName === this.config.mainBranch) {
      throw new Error('Cannot merge main branch into itself');
    }
    
    // Check for conflicts (mock)
    if (this.mockGit.state.status.conflicted.length > 0) {
      throw new Error(`Conflicts in ${this.mockGit.state.status.conflicted.length} files`);
    }
    
    // Add merge commit
    this.mockGit.state.commits.push({
      hash: 'def456',
      message: `Merge branch '${branchName}' into ${this.config.mainBranch}`,
      branch: this.config.mainBranch
    });
    
    return `Merged '${branchName}' into ${this.config.mainBranch}`;
  }

  // Helper methods for tests
  async createBranch(name) {
    if (!this.mockGit.state.branches.includes(name)) {
      this.mockGit.state.branches.push(name);
    }
  }

  async createWorktree(name) {
    const worktreePath = `.worktrees/wt-${name}`;
    this.mockGit.state.worktrees.push({
      path: worktreePath,
      branch: name,
      HEAD: 'abc123'
    });
    this.mockFS.mkdir(worktreePath);
    
    // Assign ports
    this.portMap[`wt-${name}`] = {
      vite: 3000 + this.mockGit.state.worktrees.length,
      storybook: 6006 + this.mockGit.state.worktrees.length
    };
  }

  async checkout(branch) {
    if (!this.mockGit.state.branches.includes(branch)) {
      throw new Error(`Branch '${branch}' not found`);
    }
    this.mockGit.state.currentBranch = branch;
  }

  async writeFile(filePath, content) {
    this.mockFS.writeFile(filePath, content);
    if (this.mockGit.state.status.isClean) {
      this.mockGit.state.status.isClean = false;
      this.mockGit.state.status.modified.push(filePath);
    }
  }

  async commit(message) {
    this.mockGit.state.commits.push({
      hash: Date.now().toString(16),
      message: message,
      branch: this.mockGit.state.currentBranch
    });
    this.mockGit.state.status = {
      isClean: true,
      modified: [],
      added: [],
      deleted: [],
      conflicted: []
    };
  }

  async exists(filePath) {
    return this.mockFS.exists(filePath);
  }

  async cleanup() {
    // Reset state
    this.mockGit.state = {
      branches: ['main'],
      currentBranch: 'main',
      worktrees: [],
      commits: [{ hash: 'abc123', message: 'Initial commit', branch: 'main' }],
      status: {
        isClean: true,
        modified: [],
        added: [],
        deleted: [],
        conflicted: []
      },
      tags: [],
      remotes: ['origin'],
      stashes: []
    };
    this.mockFS.files.clear();
    this.portMap = {};
  }
}

module.exports = MockRepository;