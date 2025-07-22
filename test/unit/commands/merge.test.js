const { mergeCommand } = require('../../../commands/merge');
const path = require('path');

// Mock the dependencies
jest.mock('../../../lib/config');
jest.mock('../../../lib/portManager');
jest.mock('../../../lib/gitOps');
jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));
jest.mock('chalk', () => ({
  red: jest.fn(msg => msg),
  green: jest.fn(msg => msg),
  yellow: jest.fn(msg => msg),
  blue: jest.fn(msg => msg),
  gray: jest.fn(msg => msg)
}));

const config = require('../../../lib/config');
const portManager = require('../../../lib/portManager');
const gitOps = require('../../../lib/gitOps');
const inquirer = require('inquirer');

describe('merge command', () => {
  let mockConsoleLog;
  let mockConsoleError;
  let mockProcessExit;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

    // Default mocks
    gitOps.validateRepository = jest.fn().mockResolvedValue();
    config.load = jest.fn().mockResolvedValue();
    config.get = jest.fn().mockReturnValue({
      mainBranch: 'main',
      branchProtection: { requirePR: false }
    });
    config.getBaseDir = jest.fn().mockReturnValue('/test/repo');
    config.getWorktreePath = jest.fn((name) => path.join('/test/repo', '.worktrees', name));
    portManager.init = jest.fn().mockResolvedValue();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
  });

  test('successfully merges a worktree', async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature'),
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(false);
    gitOps.hasUnpushedCommits = jest.fn().mockResolvedValue(false);
    gitOps.getCommitDiff = jest.fn().mockResolvedValue('+ Added feature\n- Removed bug');
    gitOps.checkBranchExists = jest.fn().mockResolvedValue(true);
    gitOps.getCurrentBranch = jest.fn().mockResolvedValue('main');
    gitOps.getMainBranch = jest.fn().mockResolvedValue('main');
    gitOps.mergeBranch = jest.fn().mockResolvedValue();
    gitOps.removeWorktree = jest.fn().mockResolvedValue();
    gitOps.deleteBranch = jest.fn().mockResolvedValue();
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.releasePorts = jest.fn().mockResolvedValue();
    portManager.formatPortDisplay = jest.fn().mockReturnValue('vite:3000');

    await mergeCommand('wt-feature', { push: true, delete: true });

    expect(gitOps.mergeBranch).toHaveBeenCalledWith('feature', 'main');
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Switched to branch \'main\'');
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Merged \'feature\'');
    expect(gitOps.removeWorktree).toHaveBeenCalled();
    expect(gitOps.deleteBranch).toHaveBeenCalledWith('feature');
    expect(portManager.releasePorts).toHaveBeenCalledWith('wt-feature');
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Released ports 3000');
  });

  test('exits when worktree has uncommitted changes', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature'),
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(true);

    await mergeCommand('wt-feature', {});

    expect(mockConsoleLog).toHaveBeenCalledWith('✗ Worktree has uncommitted changes');
    expect(mockConsoleLog).toHaveBeenCalledWith('Please commit or stash changes before merging');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('handles non-existent worktree', async () => {
    gitOps.listWorktrees = jest.fn().mockResolvedValue([]);

    await mergeCommand('wt-nonexistent', {});

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Worktree \'wt-nonexistent\' doesn\'t exist. Use \'wt list\' to see available worktrees');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('handles merge conflicts', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature'),
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(false);
    gitOps.hasUnpushedCommits = jest.fn().mockResolvedValue(false);
    gitOps.getCommitDiff = jest.fn().mockResolvedValue('+ Added feature');
    gitOps.checkBranchExists = jest.fn().mockResolvedValue(true);
    gitOps.getCurrentBranch = jest.fn().mockResolvedValue('main');
    gitOps.getMainBranch = jest.fn().mockResolvedValue('main');
    gitOps.mergeBranch = jest.fn().mockRejectedValue(new Error('CONFLICT'));

    await mergeCommand('wt-feature', {});

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'CONFLICT');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('merges even when on feature branch', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature'),
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(false);
    gitOps.hasUnpushedCommits = jest.fn().mockResolvedValue(false);
    gitOps.getCommitDiff = jest.fn().mockResolvedValue('+ Added feature');
    gitOps.checkBranchExists = jest.fn().mockResolvedValue(true);
    gitOps.getCurrentBranch = jest.fn().mockResolvedValue('feature');
    gitOps.getMainBranch = jest.fn().mockResolvedValue('main');
    gitOps.mergeBranch = jest.fn().mockResolvedValue();

    await mergeCommand('wt-feature', {});

    expect(gitOps.mergeBranch).toHaveBeenCalledWith('feature', 'main');
  });

  test('handles merge error', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature'),
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(false);
    gitOps.hasUnpushedCommits = jest.fn().mockResolvedValue(false);
    gitOps.getMainBranch = jest.fn().mockResolvedValue('main');
    gitOps.mergeBranch = jest.fn().mockRejectedValue(new Error('Branch not found'));

    await mergeCommand('wt-feature', {});

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Branch not found');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });


  test('handles Windows paths correctly', async () => {
    const mockWorktrees = [
      { 
        path: 'C:\\test\\repo\\.worktrees\\wt-feature',
        branch: 'feature'
      }
    ];

    config.getWorktreePath = jest.fn().mockReturnValue('C:\\test\\repo\\.worktrees\\wt-feature');
    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(false);
    gitOps.hasUnpushedCommits = jest.fn().mockResolvedValue(false);
    gitOps.getCommitDiff = jest.fn().mockResolvedValue('+ Added feature');
    gitOps.checkBranchExists = jest.fn().mockResolvedValue(true);
    gitOps.getCurrentBranch = jest.fn().mockResolvedValue('main');
    gitOps.getMainBranch = jest.fn().mockResolvedValue('main');
    gitOps.mergeBranch = jest.fn().mockResolvedValue();

    await mergeCommand('wt-feature', {});

    expect(gitOps.mergeBranch).toHaveBeenCalledWith('feature', 'main');
  });

  describe('autoCleanup behavior', () => {
    beforeEach(() => {
      // Set test environment
      process.env.NODE_ENV = 'test';
      
      const mockWorktrees = [
        { 
          path: path.join('/test/repo', '.worktrees', 'wt-feature'),
          branch: 'feature'
        }
      ];

      gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
      gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(false);
      gitOps.hasUnpushedCommits = jest.fn().mockResolvedValue(false);
      gitOps.getMainBranch = jest.fn().mockResolvedValue('main');
      gitOps.mergeBranch = jest.fn().mockResolvedValue();
      gitOps.removeWorktree = jest.fn().mockResolvedValue();
      gitOps.deleteBranch = jest.fn().mockResolvedValue();
      portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
      portManager.releasePorts = jest.fn().mockResolvedValue();
    });

    test('automatically cleans up when autoCleanup is true', async () => {
      config.get = jest.fn().mockReturnValue({
        mainBranch: 'main',
        autoCleanup: true
      });

      await mergeCommand('wt-feature', {});

      expect(gitOps.mergeBranch).toHaveBeenCalledWith('feature', 'main');
      expect(gitOps.removeWorktree).toHaveBeenCalled();
      expect(gitOps.deleteBranch).toHaveBeenCalledWith('feature');
      expect(portManager.releasePorts).toHaveBeenCalledWith('wt-feature');
    });

    test('does not clean up when autoCleanup is false', async () => {
      config.get = jest.fn().mockReturnValue({
        mainBranch: 'main',
        autoCleanup: false
      });

      await mergeCommand('wt-feature', {});

      expect(gitOps.mergeBranch).toHaveBeenCalledWith('feature', 'main');
      expect(gitOps.removeWorktree).not.toHaveBeenCalled();
      expect(gitOps.deleteBranch).not.toHaveBeenCalled();
      expect(portManager.releasePorts).not.toHaveBeenCalled();
    });

    test('--delete flag overrides autoCleanup false', async () => {
      config.get = jest.fn().mockReturnValue({
        mainBranch: 'main',
        autoCleanup: false
      });

      await mergeCommand('wt-feature', { delete: true });

      expect(gitOps.mergeBranch).toHaveBeenCalledWith('feature', 'main');
      expect(gitOps.removeWorktree).toHaveBeenCalled();
      expect(gitOps.deleteBranch).toHaveBeenCalledWith('feature');
      expect(portManager.releasePorts).toHaveBeenCalledWith('wt-feature');
    });

    test('--no-delete flag prevents cleanup when autoCleanup is true', async () => {
      config.get = jest.fn().mockReturnValue({
        mainBranch: 'main',
        autoCleanup: true
      });

      await mergeCommand('wt-feature', { delete: false });

      expect(gitOps.mergeBranch).toHaveBeenCalledWith('feature', 'main');
      expect(gitOps.removeWorktree).not.toHaveBeenCalled();
      expect(gitOps.deleteBranch).not.toHaveBeenCalled();
      expect(portManager.releasePorts).not.toHaveBeenCalled();
    });

    test('prompts user when autoCleanup is false in non-test environment', async () => {
      // Remove test environment
      delete process.env.NODE_ENV;
      
      config.get = jest.fn().mockReturnValue({
        mainBranch: 'main',
        autoCleanup: false
      });

      inquirer.prompt = jest.fn().mockResolvedValue({ confirmDelete: true });

      await mergeCommand('wt-feature', { delete: true });

      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'confirm',
        name: 'confirmDelete',
        message: 'Delete worktree and branch?',
        default: true
      }]);
      expect(gitOps.removeWorktree).toHaveBeenCalled();
    });

    test('does not prompt when autoCleanup is true', async () => {
      // Remove test environment
      delete process.env.NODE_ENV;
      
      config.get = jest.fn().mockReturnValue({
        mainBranch: 'main',
        autoCleanup: true
      });

      inquirer.prompt = jest.fn();

      await mergeCommand('wt-feature', {});

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(gitOps.removeWorktree).toHaveBeenCalled();
    });
  });

});