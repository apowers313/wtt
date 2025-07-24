const { mergeCommand } = require('../../../commands/merge');
const path = require('path');

// Mock the dependencies
jest.mock('../../../lib/config');
jest.mock('../../../lib/portManager');
jest.mock('../../../lib/gitOps');
jest.mock('../../../lib/merge-helper/message-formatter');
jest.mock('../../../lib/merge-helper/backup-manager');
jest.mock('../../../lib/merge-helper/conflict-detector');
jest.mock('../../../lib/ui/progress-ui');
jest.mock('../../../lib/currentWorktree');
jest.mock('simple-git');
jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));
jest.mock('chalk', () => ({
  red: jest.fn(msg => msg),
  green: jest.fn(msg => msg),
  yellow: jest.fn(msg => msg),
  blue: jest.fn(msg => msg),
  gray: jest.fn(msg => msg),
  cyan: jest.fn(msg => msg),
  bold: jest.fn(msg => msg)
}));

const config = require('../../../lib/config');
const portManager = require('../../../lib/portManager');
const gitOps = require('../../../lib/gitOps');
const inquirer = require('inquirer');
const MessageFormatter = require('../../../lib/merge-helper/message-formatter');
const BackupManager = require('../../../lib/merge-helper/backup-manager');
const ConflictDetector = require('../../../lib/merge-helper/conflict-detector');
const ProgressUI = require('../../../lib/ui/progress-ui');
const simpleGit = require('simple-git');

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
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(false);
    gitOps.status = jest.fn().mockResolvedValue({ conflicted: [] });
    gitOps.listWorktrees = jest.fn().mockResolvedValue([]);
    gitOps.getMainBranch = jest.fn().mockResolvedValue('main');
    gitOps.git = {
      cwd: jest.fn().mockResolvedValue(),
      checkout: jest.fn().mockResolvedValue(),
      merge: jest.fn().mockResolvedValue()
    };
    
    config.load = jest.fn().mockResolvedValue();
    config.get = jest.fn().mockReturnValue({
      mainBranch: 'main',
      branchProtection: { requirePR: false }
    });
    config.getBaseDir = jest.fn().mockReturnValue('/test/repo');
    config.getWorktreePath = jest.fn((name) => path.join('/test/repo', '.worktrees', name));
    portManager.init = jest.fn().mockResolvedValue();
    
    // Mock MessageFormatter
    MessageFormatter.mockImplementation(() => ({
      formatMergeError: jest.fn().mockReturnValue({
        title: 'Error',
        explanation: 'Test error',
        options: []
      }),
      displayFormattedError: jest.fn()
    }));
    
    // Mock BackupManager
    BackupManager.mockImplementation(() => ({
      createSafetyBackup: jest.fn().mockResolvedValue({
        id: 'test-backup-123',
        timestamp: new Date().toISOString()
      }),
      saveMergeState: jest.fn().mockResolvedValue()
    }));
    
    // Mock ConflictDetector
    ConflictDetector.mockImplementation(() => ({
      predictConflicts: jest.fn().mockResolvedValue([])
    }));
    
    // Mock ProgressUI
    ProgressUI.displayMergeProgress = jest.fn().mockReturnValue({
      updateSection: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn()
    });
    
    // Mock simple-git
    const mockGit = {
      status: jest.fn().mockResolvedValue({
        files: []
      })
    };
    simpleGit.mockReturnValue(mockGit);
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
    gitOps.removeWorktree = jest.fn().mockResolvedValue();
    gitOps.deleteBranch = jest.fn().mockResolvedValue();
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.releasePorts = jest.fn().mockResolvedValue();
    portManager.formatPortDisplay = jest.fn().mockReturnValue('vite:3000');

    await mergeCommand('wt-feature', { push: true, delete: true });

    expect(gitOps.git.checkout).toHaveBeenCalledWith('main');
    expect(gitOps.git.merge).toHaveBeenCalledWith(['feature']);
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Switched to branch \'main\'');
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Merged \'feature\'');
    expect(gitOps.removeWorktree).toHaveBeenCalled();
    expect(gitOps.deleteBranch).toHaveBeenCalledWith('feature');
    expect(portManager.releasePorts).toHaveBeenCalledWith('wt-feature');
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Released ports 3000');
  });

  test('exits when worktree has uncommitted changes', async () => {
    // Set simple error level for test
    process.env.WTT_ERROR_LEVEL = 'simple';
    
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature'),
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.hasUncommittedChanges = jest.fn()
      .mockResolvedValueOnce(false)  // Main repo check
      .mockResolvedValueOnce(true);   // Worktree check

    await mergeCommand('wt-feature', {});

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Checking worktree \'wt-feature\''));
    expect(mockConsoleLog).toHaveBeenCalledWith('✗ Worktree has uncommitted changes');
    expect(mockConsoleLog).toHaveBeenCalledWith('Please commit or stash changes before merging');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
    
    // Clean up
    delete process.env.WTT_ERROR_LEVEL;
  });

  test('handles non-existent worktree', async () => {
    // Set simple error level for test
    process.env.WTT_ERROR_LEVEL = 'simple';
    
    gitOps.listWorktrees = jest.fn().mockResolvedValue([]);

    await mergeCommand('wt-nonexistent', {});

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Worktree \'wt-nonexistent\' doesn\'t exist. Use \'wt list\' to see available worktrees');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
    
    // Clean up
    delete process.env.WTT_ERROR_LEVEL;
  });

  test('handles merge conflicts', async () => {
    // Set simple error level for test
    process.env.WTT_ERROR_LEVEL = 'simple';
    
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
    gitOps.git.merge = jest.fn().mockRejectedValue(new Error('CONFLICT'));

    await mergeCommand('wt-feature', {});

    expect(mockConsoleLog).toHaveBeenCalledWith('\n❌ Merge failed due to conflicts\n');
    expect(mockConsoleLog).toHaveBeenCalledWith('The merge resulted in conflicts that need to be resolved.');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
    
    // Clean up
    delete process.env.WTT_ERROR_LEVEL;
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

    await mergeCommand('wt-feature', {});

    expect(gitOps.git.checkout).toHaveBeenCalledWith('main');
    expect(gitOps.git.merge).toHaveBeenCalledWith(['feature']);
  });

  test('handles merge error', async () => {
    // Set simple error level for test
    process.env.WTT_ERROR_LEVEL = 'simple';
    
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
    gitOps.git.merge = jest.fn().mockRejectedValue(new Error('Branch not found'));

    await mergeCommand('wt-feature', {});

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Branch not found');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
    
    // Clean up
    delete process.env.WTT_ERROR_LEVEL;
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

    await mergeCommand('wt-feature', {});

    expect(gitOps.git.checkout).toHaveBeenCalledWith('main');
    expect(gitOps.git.merge).toHaveBeenCalledWith(['feature']);
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

      expect(gitOps.git.checkout).toHaveBeenCalledWith('main');
      expect(gitOps.git.merge).toHaveBeenCalledWith(['feature']);
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

      expect(gitOps.git.checkout).toHaveBeenCalledWith('main');
      expect(gitOps.git.merge).toHaveBeenCalledWith(['feature']);
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

      expect(gitOps.git.checkout).toHaveBeenCalledWith('main');
      expect(gitOps.git.merge).toHaveBeenCalledWith(['feature']);
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

      expect(gitOps.git.checkout).toHaveBeenCalledWith('main');
      expect(gitOps.git.merge).toHaveBeenCalledWith(['feature']);
      expect(gitOps.removeWorktree).not.toHaveBeenCalled();
      expect(gitOps.deleteBranch).not.toHaveBeenCalled();
      expect(portManager.releasePorts).not.toHaveBeenCalled();
    });

    test('prompts user when autoCleanup is false in non-test environment', async () => {
      // Temporarily disable auto-confirm for this test
      const originalAutoConfirm = process.env.WTT_AUTO_CONFIRM;
      delete process.env.WTT_AUTO_CONFIRM;
      
      config.get = jest.fn().mockReturnValue({
        mainBranch: 'main',
        autoCleanup: false
      });

      inquirer.prompt = jest.fn().mockResolvedValue({ confirmDelete: true });

      await mergeCommand('wt-feature', { delete: true });

      expect(gitOps.git.checkout).toHaveBeenCalledWith('main');
      expect(gitOps.git.merge).toHaveBeenCalledWith(['feature']);
      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'confirm',
        name: 'confirmDelete',
        message: 'Delete worktree and branch?',
        default: true
      }]);
      expect(gitOps.removeWorktree).toHaveBeenCalled();
      
      // Restore environment
      process.env.WTT_AUTO_CONFIRM = originalAutoConfirm;
    });

    test('does not prompt when autoCleanup is true', async () => {
      // Temporarily disable auto-confirm for this test
      const originalAutoConfirm = process.env.WTT_AUTO_CONFIRM;
      delete process.env.WTT_AUTO_CONFIRM;
      
      config.get = jest.fn().mockReturnValue({
        mainBranch: 'main',
        autoCleanup: true
      });

      inquirer.prompt = jest.fn();

      await mergeCommand('wt-feature', {});

      expect(gitOps.git.checkout).toHaveBeenCalledWith('main');
      expect(gitOps.git.merge).toHaveBeenCalledWith(['feature']);
      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(gitOps.removeWorktree).toHaveBeenCalled();
      
      // Restore environment
      process.env.WTT_AUTO_CONFIRM = originalAutoConfirm;
    });
  });

});