const path = require('path');

// Create reusable mock factories for testing

function createMockGitOps() {
  return {
    checkUncommittedChanges: jest.fn().mockResolvedValue(false),
    getUncommittedFiles: jest.fn().mockResolvedValue([]),
    hasUnpushedCommits: jest.fn().mockResolvedValue(false),
    getWorktrees: jest.fn().mockResolvedValue([]),
    createWorktree: jest.fn().mockResolvedValue(),
    removeWorktree: jest.fn().mockResolvedValue(),
    getMainBranch: jest.fn().mockResolvedValue('main'),
    getCurrentBranch: jest.fn().mockResolvedValue('main'),
    branchExists: jest.fn().mockResolvedValue(false),
    createBranch: jest.fn().mockResolvedValue(),
    switchBranch: jest.fn().mockResolvedValue(),
    deleteBranch: jest.fn().mockResolvedValue(),
    isWorktreePath: jest.fn().mockReturnValue(false),
    getWorktreeInfo: jest.fn().mockResolvedValue(null),
    getBranchCommitsBehind: jest.fn().mockResolvedValue(0),
    getBranchCommitsAhead: jest.fn().mockResolvedValue(0),
    mergeBranch: jest.fn().mockResolvedValue(),
    checkRemoteBranchExists: jest.fn().mockResolvedValue(false),
    fetch: jest.fn().mockResolvedValue(),
    push: jest.fn().mockResolvedValue(),
    pull: jest.fn().mockResolvedValue()
  };
}

function createMockPortManager() {
  return {
    load: jest.fn().mockResolvedValue(),
    save: jest.fn().mockResolvedValue(),
    assignPort: jest.fn().mockResolvedValue(3000),
    releasePort: jest.fn().mockResolvedValue(),
    getWorktreePorts: jest.fn().mockReturnValue([]),
    getAllAssignments: jest.fn().mockReturnValue(new Map()),
    getPortsForWorktree: jest.fn().mockReturnValue([]),
    isPortInUse: jest.fn().mockResolvedValue(false),
    getRunningPorts: jest.fn().mockResolvedValue([]),
    findAvailablePort: jest.fn().mockResolvedValue(3000)
  };
}

function createMockConfig() {
  const defaultConfig = {
    worktreeDir: '.worktrees',
    portRanges: {
      vite: { start: 3000, end: 3099 },
      storybook: { start: 6000, end: 6099 },
      other: { start: 8000, end: 8099 }
    },
    cleanupOnMerge: true,
    openBrowser: true,
    defaultBase: 'main'
  };

  return {
    load: jest.fn().mockResolvedValue(defaultConfig),
    save: jest.fn().mockResolvedValue(),
    get: jest.fn((key) => {
      const keys = key.split('.');
      let value = defaultConfig;
      for (const k of keys) {
        value = value[k];
      }
      return value;
    }),
    update: jest.fn().mockResolvedValue(),
    getWorktreeDir: jest.fn().mockReturnValue('.worktrees'),
    getWorktreePath: jest.fn((branch) => path.join('.worktrees', branch))
  };
}

function createMockFileSystem() {
  return {
    existsSync: jest.fn().mockReturnValue(false),
    mkdirSync: jest.fn(),
    rmSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue('{}'),
    readdirSync: jest.fn().mockReturnValue([])
  };
}

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    debug: jest.fn()
  };
}

function createMockPrompter() {
  return {
    confirm: jest.fn().mockResolvedValue(true),
    input: jest.fn().mockResolvedValue('test-input'),
    select: jest.fn().mockResolvedValue('option1'),
    multiselect: jest.fn().mockResolvedValue(['option1'])
  };
}

// Helper to setup all mocks at once
function setupMocks() {
  const mocks = {
    gitOps: createMockGitOps(),
    portManager: createMockPortManager(),
    config: createMockConfig(),
    fs: createMockFileSystem(),
    logger: createMockLogger(),
    prompter: createMockPrompter()
  };

  // Setup jest mocks
  jest.mock('../../lib/gitOps', () => mocks.gitOps);
  jest.mock('../../lib/portManager', () => mocks.portManager);
  jest.mock('../../lib/config', () => mocks.config);
  jest.mock('../../lib/logger', () => mocks.logger);
  jest.mock('../../lib/prompter', () => mocks.prompter);
  jest.mock('fs', () => mocks.fs);

  return mocks;
}

// Helper to reset all mocks
function resetMocks(...mocks) {
  mocks.forEach(mock => {
    if (typeof mock === 'object' && mock !== null) {
      Object.values(mock).forEach(fn => {
        if (typeof fn === 'function' && fn.mockReset) {
          fn.mockReset();
        }
      });
    }
  });
}

module.exports = {
  createMockGitOps,
  createMockPortManager,
  createMockConfig,
  createMockFileSystem,
  createMockLogger,
  createMockPrompter,
  setupMocks,
  resetMocks
};