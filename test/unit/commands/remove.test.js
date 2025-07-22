const { removeCommand } = require('../../../commands/remove');
const path = require('path');
const fs = require('fs').promises;

// Mock the dependencies
jest.mock('../../../lib/config');
jest.mock('../../../lib/portManager');
jest.mock('../../../lib/gitOps');
jest.mock('fs').promises;
jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));
jest.mock('chalk', () => ({
  red: jest.fn(msg => msg),
  green: jest.fn(msg => msg),
  yellow: jest.fn(msg => msg),
  gray: jest.fn(msg => msg)
}));

const config = require('../../../lib/config');
const portManager = require('../../../lib/portManager');
const gitOps = require('../../../lib/gitOps');
const inquirer = require('inquirer');

describe('remove command', () => {
  let mockConsoleLog;
  let mockConsoleError;
  let mockProcessExit;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

    // Set test environment
    process.env.NODE_ENV = 'test';

    // Default mocks
    gitOps.validateRepository = jest.fn().mockResolvedValue();
    config.load = jest.fn().mockResolvedValue();
    config.get = jest.fn().mockReturnValue({});
    config.getBaseDir = jest.fn().mockReturnValue('/test/repo');
    config.getWorktreePath = jest.fn((name) => path.join('/test/repo', '.worktrees', name));
    portManager.init = jest.fn().mockResolvedValue();
    fs.access = jest.fn().mockResolvedValue();
    fs.rm = jest.fn().mockResolvedValue();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
    delete process.env.NODE_ENV;
  });

  test('successfully removes a worktree', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature'),
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(false);
    gitOps.hasUnpushedCommits = jest.fn().mockResolvedValue(false);
    gitOps.removeWorktree = jest.fn().mockResolvedValue();
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.releasePorts = jest.fn().mockResolvedValue();
    portManager.formatPortDisplay = jest.fn().mockReturnValue('vite:3000');

    await removeCommand('wt-feature', { force: true });

    expect(gitOps.removeWorktree).toHaveBeenCalledWith(
      path.join('/test/repo', '.worktrees', 'wt-feature'),
      true
    );
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Removed worktree');
    expect(portManager.releasePorts).toHaveBeenCalledWith('wt-feature');
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Released ports vite:3000');
    expect(mockConsoleLog).toHaveBeenCalledWith('\nNote: Branch \'feature\' still exists.');
  });

  test('prompts for confirmation with uncommitted changes', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature'),
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(true);
    gitOps.removeWorktree = jest.fn().mockResolvedValue();
    portManager.getPorts = jest.fn().mockReturnValue(null);

    // In test environment, defaults to false
    await removeCommand('wt-feature', {});

    expect(gitOps.removeWorktree).not.toHaveBeenCalled();
  });

  test('handles non-existent worktree', async () => {
    gitOps.listWorktrees = jest.fn().mockResolvedValue([]);
    portManager.getPorts = jest.fn().mockReturnValue(null);
    fs.access = jest.fn().mockRejectedValue(new Error('Not found'));

    await removeCommand('wt-nonexistent', {});

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Worktree \'wt-nonexistent\' doesn\'t exist. Use \'wt list\' to see available worktrees');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('handles broken worktree (directory does not exist)', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-broken'),
        branch: 'broken'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.removeWorktree = jest.fn().mockResolvedValue();
    portManager.getPorts = jest.fn().mockReturnValue(null);
    // First access for checking existence fails
    fs.access = jest.fn().mockRejectedValue(new Error('Not found'));

    await removeCommand('wt-broken', { force: true });

    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Removed worktree');
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Cleaned up broken worktree registration');
  });

  test('removes worktree with force flag', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature'),
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(true);
    gitOps.hasUnpushedCommits = jest.fn().mockResolvedValue(true);
    gitOps.removeWorktree = jest.fn().mockResolvedValue();
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.releasePorts = jest.fn().mockResolvedValue();
    portManager.formatPortDisplay = jest.fn().mockReturnValue('vite:3000');

    await removeCommand('wt-feature', { force: true });

    expect(gitOps.removeWorktree).toHaveBeenCalledWith(
      path.join('/test/repo', '.worktrees', 'wt-feature'),
      true
    );
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Removed worktree');
  });

  test('cleans up orphaned worktree directory', async () => {
    // No git worktree but directory exists
    gitOps.listWorktrees = jest.fn().mockResolvedValue([]);
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.releasePorts = jest.fn().mockResolvedValue();
    portManager.formatPortDisplay = jest.fn().mockReturnValue('vite:3000');
    fs.access = jest.fn().mockResolvedValue(); // Directory exists

    await removeCommand('wt-orphaned', { force: true });

    expect(fs.rm).toHaveBeenCalledWith(
      path.join('/test/repo', '.worktrees', 'wt-orphaned'),
      { recursive: true }
    );
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Removed worktree directory');
    expect(portManager.releasePorts).toHaveBeenCalledWith('wt-orphaned');
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
    gitOps.removeWorktree = jest.fn().mockResolvedValue();
    portManager.getPorts = jest.fn().mockReturnValue(null);

    await removeCommand('wt-feature', { force: true });

    expect(gitOps.removeWorktree).toHaveBeenCalledWith(
      'C:\\test\\repo\\.worktrees\\wt-feature',
      true
    );
  });

  test('prompts for final confirmation in non-test environment', async () => {
    delete process.env.NODE_ENV;
    
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature'),
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(false);
    gitOps.hasUnpushedCommits = jest.fn().mockResolvedValue(false);
    inquirer.prompt = jest.fn().mockResolvedValue({ confirmFinal: false });

    await removeCommand('wt-feature', {});

    expect(inquirer.prompt).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        name: 'confirmFinal',
        message: 'Are you sure you want to remove this worktree?'
      })
    ]));
    expect(gitOps.removeWorktree).not.toHaveBeenCalled();
  });

  test('handles error and exits with code 1', async () => {
    const error = new Error('Repository validation failed');
    gitOps.validateRepository = jest.fn().mockRejectedValue(error);

    await removeCommand('wt-feature', {});

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Repository validation failed');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('fallback worktree matching by name', async () => {
    const mockWorktrees = [
      { 
        path: '/different/path/.worktrees/wt-feature',
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(false);
    gitOps.hasUnpushedCommits = jest.fn().mockResolvedValue(false);
    gitOps.removeWorktree = jest.fn().mockResolvedValue();
    portManager.getPorts = jest.fn().mockReturnValue(null);

    await removeCommand('wt-feature', { force: true });

    expect(gitOps.removeWorktree).toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Removed worktree');
  });
});