/**
 * Mock Repository for WTT Testing
 * Simulates git repository operations without filesystem access
 */

const GitMock = require('./git-mock-new');
const PathManager = require('../../lib/path-manager');
const Output = require('../../lib/output');

class MockRepository {
  constructor(options = {}) {
    this.gitRoot = options.gitRoot || '/tmp/test-repo';
    this.git = new GitMock(options);
    this.pathManager = new PathManager(this.gitRoot);
    this.output = new Output({ verbose: false, quiet: true });
    this.mockFS = new MockFileSystem();
    this.portManager = new MockPortManager();
    
    // Initialize with basic structure
    this._setupInitialState(options);
  }

  async init() {
    // Create basic directory structure
    this.mockFS.mkdir('.worktrees');
    this.mockFS.writeFile('.worktree-config.json', JSON.stringify({
      worktreeDir: '.worktrees',
      mainBranch: 'main',
      autoCleanup: false,
      ports: {
        vite: { start: 3000, end: 3099 },
        storybook: { start: 6006, end: 6106 },
        custom: { start: 8080, end: 8179 }
      }
    }, null, 2));
    
    return this;
  }

  async createBranch(branchName) {
    this.git.addBranch(branchName);
    return this;
  }

  async createWorktree(worktreeName, branchName, options = {}) {
    const worktreePath = this.pathManager.getWorktreePath(worktreeName);
    
    if (!options.skipBranchCreation) {
      this.git.addBranch(branchName);
    }
    
    this.git.addWorktree(worktreePath, branchName);
    
    // Create worktree directory structure
    this.mockFS.mkdir(worktreePath);
    
    // Assign ports
    const ports = this.portManager.assignPorts(worktreeName);
    
    // Create .env.worktree
    const envContent = Object.entries(ports)
      .map(([service, port]) => `${service.toUpperCase()}_PORT=${port}`)
      .join('\n') + '\n';
    
    this.mockFS.writeFile(`${worktreePath}/.env.worktree`, envContent);
    
    return this;
  }

  async writeFile(filePath, content) {
    this.mockFS.writeFile(filePath, content);
    return this;
  }

  async commit(message) {
    this.git.state.commits.push({
      message,
      timestamp: Date.now(),
      branch: this.git.state.currentBranch
    });
    return this;
  }

  async checkout(branch) {
    await this.git.checkout(branch);
    return this;
  }

  async run(command, args = []) {
    // Simulate running WTT commands
    const [cmd, ...cmdArgs] = command.split(' ');
    
    switch (cmd) {
      case 'create':
        return this._mockCreateCommand(cmdArgs[0]);
      case 'list':
        return this._mockListCommand();
      case 'merge':
        return this._mockMergeCommand(cmdArgs[0]);
      case 'remove':
        return this._mockRemoveCommand(cmdArgs[0]);
      default:
        return {
          exitCode: 0,
          stdout: `wt ${cmd}: mock result`,
          stderr: ''
        };
    }
  }

  _setupInitialState(options) {
    if (options.branches) {
      this.git.state.branches = [...options.branches];
    }
    
    if (options.currentBranch) {
      this.git.state.currentBranch = options.currentBranch;
    }
    
    if (options.clean === false) {
      this.git.setDirtyState([
        { path: 'modified.txt', working_dir: 'M' }
      ]);
    }
  }

  _mockCreateCommand(branchName) {
    if (!branchName) {
      return {
        exitCode: 2,
        stdout: '',
        stderr: 'wt create: error: branch name required'
      };
    }
    
    const worktreePath = this.pathManager.getRelativeFromRoot(
      this.pathManager.getWorktreePath(branchName)
    );
    
    return {
      exitCode: 0,
      stdout: `wt create: created worktree '${branchName}' at ${worktreePath}`,
      stderr: ''
    };
  }

  _mockListCommand() {
    const worktreeCount = this.git.state.worktrees.length;
    const names = this.git.state.worktrees.map(wt => 
      this.pathManager.getDisplayName(wt.path.split('/').pop())
    );
    
    if (worktreeCount === 0) {
      return {
        exitCode: 0,
        stdout: 'wt list: no worktrees found',
        stderr: ''
      };
    }
    
    return {
      exitCode: 0,
      stdout: `wt list: ${worktreeCount} worktrees: ${names.join(', ')}`,
      stderr: ''
    };
  }

  _mockMergeCommand(worktreeName) {
    if (this.git.state.conflicts.length > 0) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'wt merge: error: conflicts in 2 files (run \'git status\' for details)'
      };
    }
    
    return {
      exitCode: 0,
      stdout: `wt merge: merged '${worktreeName || 'current'}' into main`,
      stderr: ''
    };
  }

  _mockRemoveCommand(worktreeName) {
    return {
      exitCode: 0,
      stdout: `wt remove: removed worktree '${worktreeName || 'current'}'`,
      stderr: ''
    };
  }
}

/**
 * Mock File System for testing
 */
class MockFileSystem {
  constructor() {
    this.files = new Map();
    this.directories = new Set();
  }

  exists(path) {
    return this.files.has(path) || this.directories.has(path);
  }

  readFile(path) {
    return this.files.get(path) || null;
  }

  writeFile(path, content) {
    this.files.set(path, content);
    
    // Create parent directories
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join('/');
      if (dirPath) {
        this.directories.add(dirPath);
      }
    }
  }

  mkdir(path) {
    this.directories.add(path);
  }

  _setState(newState) {
    if (newState.files) {
      this.files = new Map(Object.entries(newState.files));
    }
    if (newState.directories) {
      this.directories = new Set(newState.directories);
    }
  }
}

/**
 * Mock Port Manager for testing
 */
class MockPortManager {
  constructor() {
    this.assignedPorts = new Map();
    this.conflicts = [];
  }

  assignPorts(worktreeName) {
    const ports = {
      vite: 3000 + this.assignedPorts.size,
      storybook: 6006 + this.assignedPorts.size,
      custom: 8080 + this.assignedPorts.size
    };
    
    this.assignedPorts.set(worktreeName, ports);
    return ports;
  }

  getPorts(worktreeName) {
    return this.assignedPorts.get(worktreeName) || null;
  }

  getConflicts() {
    return [...this.conflicts];
  }

  _setState(newState) {
    if (newState.assignedPorts) {
      this.assignedPorts = new Map(Object.entries(newState.assignedPorts));
    }
    if (newState.conflicts) {
      this.conflicts = [...newState.conflicts];
    }
  }
}

module.exports = MockRepository;