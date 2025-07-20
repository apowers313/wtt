// Mock all dependencies before requiring anything
jest.mock('simple-git', () => {
  return jest.fn(() => ({
    status: jest.fn(),
    branch: jest.fn(),
    raw: jest.fn(),
    checkout: jest.fn(),
    merge: jest.fn(),
    fetch: jest.fn(),
    push: jest.fn(),
    pull: jest.fn(),
    log: jest.fn()
  }));
});

jest.mock('../../../lib/gitOps');
jest.mock('../../../lib/portManager');
jest.mock('../../../lib/config');
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue(),
    readFile: jest.fn().mockRejectedValue(new Error('File not found')),
    access: jest.fn().mockRejectedValue(new Error('File not found'))
  }
}));

const { createCommand } = require('../../../commands/create');
const {
  createMockGitOps,
  createMockPortManager,
  createMockConfig,
  createMockFileSystem
} = require('../../setup/mockHelpers');
const chalk = require('chalk');
const path = require('path');

// Mock console methods
const mockConsole = {
  log: jest.spyOn(console, 'log').mockImplementation(),
  error: jest.spyOn(console, 'error').mockImplementation()
};

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit called with "${code}"`);
});

describe('create command', () => {
  let mockGitOps, mockPortManager, mockConfig, mockFs;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks with default behavior
    mockGitOps = require('../../../lib/gitOps');
    Object.assign(mockGitOps, createMockGitOps());
    
    mockPortManager = require('../../../lib/portManager');
    Object.assign(mockPortManager, createMockPortManager());
    
    mockConfig = require('../../../lib/config');
    Object.assign(mockConfig, createMockConfig());
    
    mockFs = require('fs').promises;
    
    // Default mock implementations
    mockGitOps.validateRepository.mockResolvedValue();
    mockGitOps.listWorktrees.mockResolvedValue([]);
    mockGitOps.checkBranchExists.mockResolvedValue(true);
    mockGitOps.createWorktree.mockResolvedValue();
    
    mockConfig.load.mockResolvedValue();
    mockConfig.get.mockReturnValue({
      portRanges: {
        vite: { start: 3000, end: 3099 },
        storybook: { start: 6000, end: 6099 }
      }
    });
    mockConfig.getWorktreeName.mockImplementation(branch => `wt-${branch}`);
    mockConfig.getWorktreePath.mockImplementation(name => `.worktrees/${name}`);
    mockConfig.getBaseDir.mockReturnValue('/project');
    
    mockPortManager.init.mockResolvedValue();
    mockPortManager.assignPorts.mockResolvedValue({
      vite: 3000,
      storybook: 6000
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockConsole.log.mockClear();
    mockConsole.error.mockClear();
    mockExit.mockClear();
  });

  test('creates worktree with port assignment successfully', async () => {
    await createCommand('feature-test', {});
    
    // Verify repository validation
    expect(mockGitOps.validateRepository).toHaveBeenCalled();
    
    // Verify config loaded
    expect(mockConfig.load).toHaveBeenCalled();
    
    // Verify worktree creation
    expect(mockGitOps.createWorktree).toHaveBeenCalledWith(
      '.worktrees/wt-feature-test',
      'feature-test',
      null
    );
    
    // Verify port assignment
    expect(mockPortManager.init).toHaveBeenCalledWith('/project');
    expect(mockPortManager.assignPorts).toHaveBeenCalledWith(
      'wt-feature-test',
      ['vite', 'storybook'],
      { vite: { start: 3000, end: 3099 }, storybook: { start: 6000, end: 6099 } }
    );
    
    // Verify .env.worktree creation
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      path.join('.worktrees', 'wt-feature-test', '.env.worktree'),
      'VITE_PORT=3000\nSTORYBOOK_PORT=6000\nWORKTREE_NAME=wt-feature-test\n'
    );
    
    // Verify success messages
    expect(mockConsole.log).toHaveBeenCalledWith(
      expect.stringContaining('✓ Worktree created')
    );
    expect(mockConsole.log).toHaveBeenCalledWith(
      expect.stringContaining('✓ Assigned ports')
    );
  });

  test('creates worktree from specific base branch', async () => {
    await createCommand('feature-test', { from: 'develop' });
    
    // Verify base branch was checked
    expect(mockGitOps.checkBranchExists).toHaveBeenCalledWith('develop');
    
    // Verify worktree created from base branch
    expect(mockGitOps.createWorktree).toHaveBeenCalledWith(
      '.worktrees/wt-feature-test',
      'feature-test',
      'develop'
    );
  });

  test('throws error when worktree already exists', async () => {
    mockGitOps.listWorktrees.mockResolvedValue([
      { path: '.worktrees/wt-feature-test', branch: 'feature-test' }
    ]);
    
    try {
      await createCommand('feature-test', {});
    } catch (e) {
      // Expected to throw due to process.exit
    }
    
    expect(mockConsole.error).toHaveBeenCalledWith(
      chalk.red('Error:'),
      'Worktree already exists at .worktrees/wt-feature-test'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('throws error when base branch does not exist', async () => {
    mockGitOps.checkBranchExists.mockResolvedValue(false);
    
    try {
      await createCommand('feature-test', { from: 'nonexistent' });
    } catch (e) {
      // Expected to throw due to process.exit
    }
    
    expect(mockConsole.error).toHaveBeenCalledWith(
      chalk.red('Error:'),
      "Base branch 'nonexistent' does not exist"
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('updates gitignore to include .env.worktree', async () => {
    mockFs.readFile.mockResolvedValueOnce('node_modules\n');
    
    await createCommand('feature-test', {});
    
    // Should read existing gitignore
    expect(mockFs.readFile).toHaveBeenCalledWith(
      path.join('.worktrees', 'wt-feature-test', '.gitignore'),
      'utf8'
    );
    
    // Should append .env.worktree
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      path.join('.worktrees', 'wt-feature-test', '.gitignore'),
      'node_modules\n.env.worktree\n'
    );
  });

  test('creates gitignore when it does not exist', async () => {
    mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
    
    await createCommand('feature-test', {});
    
    // Should create new gitignore with .env.worktree
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      path.join('.worktrees', 'wt-feature-test', '.gitignore'),
      '\n.env.worktree\n'
    );
  });

  test('handles gitignore update errors gracefully', async () => {
    mockFs.readFile.mockRejectedValueOnce(new Error('Permission denied'));
    mockFs.writeFile
      .mockResolvedValueOnce() // .env.worktree succeeds
      .mockRejectedValueOnce(new Error('Permission denied')); // .gitignore fails
    
    await createCommand('feature-test', {});
    
    // Should show warning but not fail
    expect(mockConsole.log).toHaveBeenCalledWith(
      expect.stringContaining('⚠ Could not update .gitignore')
    );
    
    // Should still complete successfully
    expect(mockExit).not.toHaveBeenCalled();
  });

  test('displays usage instructions with package.json', async () => {
    mockFs.access.mockResolvedValueOnce(); // package.json exists
    
    await createCommand('feature-test', {});
    
    // Should show cd command
    expect(mockConsole.log).toHaveBeenCalledWith(
      chalk.gray('  cd .worktrees/wt-feature-test')
    );
    
    // Should show dev server commands with ports
    expect(mockConsole.log).toHaveBeenCalledWith(
      chalk.gray('  npm run dev        # Runs on port 3000')
    );
    expect(mockConsole.log).toHaveBeenCalledWith(
      chalk.gray('  npm run storybook  # Runs on port 6000')
    );
  });

  test('handles repository validation errors', async () => {
    mockGitOps.validateRepository.mockRejectedValue(
      new Error('Not a git repository')
    );
    
    try {
      await createCommand('feature-test', {});
    } catch (e) {
      // Expected to throw due to process.exit
    }
    
    expect(mockConsole.error).toHaveBeenCalledWith(
      chalk.red('Error:'),
      'Not a git repository'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('handles port assignment errors', async () => {
    mockPortManager.assignPorts.mockRejectedValue(
      new Error('No available ports')
    );
    
    try {
      await createCommand('feature-test', {});
    } catch (e) {
      // Expected to throw due to process.exit
    }
    
    expect(mockConsole.error).toHaveBeenCalledWith(
      chalk.red('Error:'),
      'No available ports'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('handles worktree creation errors', async () => {
    mockGitOps.createWorktree.mockRejectedValue(
      new Error('Branch already exists')
    );
    
    try {
      await createCommand('feature-test', {});
    } catch (e) {
      // Expected to throw due to process.exit
    }
    
    expect(mockConsole.error).toHaveBeenCalledWith(
      chalk.red('Error:'),
      'Branch already exists'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('handles file write errors', async () => {
    mockFs.writeFile.mockRejectedValueOnce(new Error('Disk full'));
    
    try {
      await createCommand('feature-test', {});
    } catch (e) {
      // Expected to throw due to process.exit
    }
    
    expect(mockConsole.error).toHaveBeenCalledWith(
      chalk.red('Error:'),
      'Disk full'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});