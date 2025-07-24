const mergeCommand = require('../../../commands/merge').mergeCommand;
const config = require('../../../lib/config');
const gitOps = require('../../../lib/gitOps');
const BackupManager = require('../../../lib/merge-helper/backup-manager');
const ConflictDetector = require('../../../lib/merge-helper/conflict-detector');
const portManager = require('../../../lib/portManager');
const ProgressUI = require('../../../lib/ui/progress-ui');
const simpleGit = require('simple-git');
const chalk = require('chalk');

jest.mock('../../../lib/config');
jest.mock('../../../lib/gitOps');
jest.mock('../../../lib/merge-helper/backup-manager');
jest.mock('../../../lib/merge-helper/conflict-detector');
jest.mock('../../../lib/currentWorktree');
jest.mock('../../../lib/portManager');
jest.mock('../../../lib/ui/progress-ui');
jest.mock('simple-git');

describe('Enhanced Merge Command', () => {
  let mockConsoleLog;
  let mockConsoleError;
  let mockProcessExit;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

    // Default mocks
    config.load.mockResolvedValue();
    config.get.mockReturnValue({
      mainBranch: 'main',
      mergeHelper: { skillLevel: 'beginner' }
    });
    config.getBaseDir.mockReturnValue('/test/repo/.worktrees');
    config.getWorktreePath.mockReturnValue('/test/repo/.worktrees/feature-branch');
    config.exists = jest.fn().mockResolvedValue(true);
    
    portManager.init = jest.fn().mockResolvedValue();
    
    gitOps.validateRepository.mockResolvedValue();
    gitOps.hasUncommittedChanges.mockResolvedValue(false);
    gitOps.hasUnpushedCommits.mockResolvedValue(false);
    gitOps.getMainBranch.mockResolvedValue('main');
    gitOps.listWorktrees.mockResolvedValue([
      { path: '/test/repo/.worktrees/feature-branch', branch: 'feature-branch' }
    ]);
    gitOps.git = {
      cwd: jest.fn().mockResolvedValue(),
      checkout: jest.fn().mockResolvedValue(),
      merge: jest.fn().mockResolvedValue()
    };

    BackupManager.mockImplementation(() => ({
      createSafetyBackup: jest.fn().mockResolvedValue({
        id: 'merge-123',
        operation: 'merge',
        timestamp: new Date().toISOString()
      }),
      saveMergeState: jest.fn().mockResolvedValue()
    }));

    ConflictDetector.mockImplementation(() => ({
      predictConflicts: jest.fn().mockResolvedValue([])
    }));
    
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

  describe('Pre-merge validation', () => {
    it('should block merge when main repository has uncommitted changes', async () => {
      // Force enhanced error mode
      delete process.env.WTT_ERROR_LEVEL;
      
      gitOps.hasUncommittedChanges.mockResolvedValueOnce(true); // Main repo has changes
      
      // Mock simple-git to return non-worktree files
      const mockGit = {
        status: jest.fn().mockResolvedValue({
          files: [
            { path: 'src/app.js' },
            { path: 'README.md' }
          ]
        })
      };
      simpleGit.mockReturnValue(mockGit);
      
      await mergeCommand('feature-branch', {});
      
      // Should show enhanced error message
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.red.bold('\n❌ Pre-merge validation failed\n')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.yellow('Main repository has uncommitted changes')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should block merge when worktree has uncommitted changes', async () => {
      gitOps.hasUncommittedChanges
        .mockResolvedValueOnce(false) // Main repo clean
        .mockResolvedValueOnce(true); // Worktree has changes
      
      await mergeCommand('feature-branch', {});
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('has uncommitted changes')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should pass validation when everything is clean', async () => {
      await mergeCommand('feature-branch', {});
      
      expect(gitOps.git.merge).toHaveBeenCalledWith(['feature-branch']);
      expect(mockProcessExit).not.toHaveBeenCalled();
    });
  });

  describe('Conflict prediction', () => {
    it('should run conflict prediction before merge', async () => {
      const mockDetector = {
        predictConflicts: jest.fn().mockResolvedValue([
          {
            file: 'src/app.js',
            risk: 'high',
            reason: 'File modified in both branches'
          }
        ])
      };
      ConflictDetector.mockImplementation(() => mockDetector);
      
      // Auto-confirm to proceed
      process.env.WTT_AUTO_CONFIRM = 'true';
      
      await mergeCommand('feature-branch', {});
      
      expect(mockDetector.predictConflicts).toHaveBeenCalledWith('main');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Potential conflicts detected')
      );
      
      delete process.env.WTT_AUTO_CONFIRM;
    });

    it('should skip conflict prediction with --force flag', async () => {
      const mockDetector = {
        predictConflicts: jest.fn()
      };
      ConflictDetector.mockImplementation(() => mockDetector);
      
      await mergeCommand('feature-branch', { force: true });
      
      expect(mockDetector.predictConflicts).not.toHaveBeenCalled();
    });
  });

  describe('Backup creation', () => {
    it('should create backup before merge', async () => {
      const mockBackupManager = {
        createSafetyBackup: jest.fn().mockResolvedValue({
          id: 'merge-123',
          operation: 'merge'
        }),
        saveMergeState: jest.fn()
      };
      BackupManager.mockImplementation(() => mockBackupManager);
      
      await mergeCommand('feature-branch', {});
      
      expect(mockBackupManager.createSafetyBackup).toHaveBeenCalledWith('merge', {
        metadata: {
          worktreeName: 'feature-branch',
          branchName: 'feature-branch',
          targetBranch: 'main'
        }
      });
    });
  });

  describe('Merge conflict handling', () => {
    it('should handle merge conflicts gracefully', async () => {
      const conflictError = new Error('CONFLICT: Merge conflict in src/app.js');
      gitOps.git.merge.mockRejectedValue(conflictError);
      
      const mockBackupManager = {
        createSafetyBackup: jest.fn().mockResolvedValue({ id: 'merge-123' }),
        saveMergeState: jest.fn()
      };
      BackupManager.mockImplementation(() => mockBackupManager);
      
      await mergeCommand('feature-branch', {});
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Merge failed due to conflicts')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('wt conflicts list')
      );
      expect(mockBackupManager.saveMergeState).toHaveBeenCalledWith({
        worktreeName: 'feature-branch',
        branchName: 'feature-branch',
        mainBranch: 'main',
        conflicted: true,
        timestamp: expect.any(String)
      });
    });
  });

  describe('Progress tracking', () => {
    it('should show progress during merge', async () => {
      await mergeCommand('feature-branch', {});
      
      // Check that progress messages were shown
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Switched to branch')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Merged')
      );
    });
  });

  describe('--check option', () => {
    it('should preview merge without executing', async () => {
      const mockDetector = {
        predictConflicts: jest.fn().mockResolvedValue([])
      };
      ConflictDetector.mockImplementation(() => mockDetector);
      
      await mergeCommand('feature-branch', { check: true });
      
      expect(mockDetector.predictConflicts).toHaveBeenCalled();
      expect(gitOps.git.merge).not.toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No conflicts predicted')
      );
    });
  });

  describe('Error handling', () => {
    it('should display human-friendly error messages', async () => {
      const error = new Error('Your local changes would be overwritten by merge');
      gitOps.hasUncommittedChanges.mockRejectedValue(error);
      
      await mergeCommand('feature-branch', {});
      
      // Should use the message formatter
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});