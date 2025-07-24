const chalk = require('chalk');
const inquirer = require('inquirer');
const { simpleGit } = require('simple-git');
const {
  recoveryFindCommitsCommand,
  recoveryRestoreCommand,
  recoveryStashCommand
} = require('../../../commands/recovery');
const gitOps = require('../../../lib/gitOps');
const BackupManager = require('../../../lib/merge-helper/backup-manager');
const ProgressUI = require('../../../lib/ui/progress-ui');
const { addCommandContext } = require('../../../lib/errorTranslator');

jest.mock('simple-git');
jest.mock('inquirer');
jest.mock('../../../lib/gitOps');
jest.mock('../../../lib/merge-helper/backup-manager');
jest.mock('../../../lib/ui/progress-ui');
jest.mock('../../../lib/errorTranslator');

describe('recovery commands', () => {
  let mockConsoleLog;
  let mockConsoleError;
  let mockProcessExit;
  let mockGit;
  let mockBackupManager;
  let mockSpinner;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();
    
    mockGit = {
      raw: jest.fn(),
      show: jest.fn(),
      branch: jest.fn(),
      checkout: jest.fn(),
      revparse: jest.fn(),
      stash: jest.fn(),
      stashList: jest.fn()
    };
    simpleGit.mockReturnValue(mockGit);
    
    mockBackupManager = {
      listBackups: jest.fn(),
      restoreBackup: jest.fn(),
      getBackupInfo: jest.fn()
    };
    BackupManager.mockImplementation(() => mockBackupManager);
    
    mockSpinner = {
      start: jest.fn(),
      stop: jest.fn(),
      succeed: jest.fn(),
      fail: jest.fn()
    };
    ProgressUI.createSpinner = jest.fn().mockReturnValue(mockSpinner);
    
    gitOps.validateRepository.mockResolvedValue();
    addCommandContext.mockReturnValue({ tips: [] });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
  });

  describe('recoveryFindCommitsCommand', () => {
    it('should display no lost commits message when none found', async () => {
      mockGit.raw.mockResolvedValueOnce(''); // Empty reflog
      
      await recoveryFindCommitsCommand();
      
      expect(gitOps.validateRepository).toHaveBeenCalled();
      expect(mockGit.raw).toHaveBeenCalledWith(['reflog', '--date=relative', '--format=%h %gd %gs %s']);
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.green('\n✅ No lost commits found!'));
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.gray('All your recent work is safely in branches.'));
    });

    it('should find and display unreachable commits', async () => {
      const reflogOutput = 'abc1234 HEAD@{0}: commit: Fix bug\ndef5678 HEAD@{1}: commit: Add feature';
      mockGit.raw.mockResolvedValueOnce(reflogOutput);
      
      // Mock commit details
      mockGit.show
        .mockResolvedValueOnce('abc1234567890|2025-07-23 10:00:00 -0500|John Doe|Fix bug')
        .mockResolvedValueOnce('def5678901234|2025-07-23 09:00:00 -0500|Jane Smith|Add feature');
      
      // Mock branch contains (empty = unreachable)
      mockGit.raw
        .mockResolvedValueOnce('') // First commit is unreachable
        .mockResolvedValueOnce(''); // Second commit is unreachable
      
      await recoveryFindCommitsCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.yellow('\n🔍 Found 2 commit(s) that might be lost:\n')
      );
    });

    it('should filter commits by date when since option is provided', async () => {
      const reflogOutput = 'abc1234 HEAD@{0}: commit: Recent commit\ndef5678 HEAD@{1}: commit: Old commit';
      mockGit.raw.mockResolvedValueOnce(reflogOutput);
      
      // Mock commit details
      mockGit.show
        .mockResolvedValueOnce('abc1234567890|2025-07-23 10:00:00 -0500|John Doe|Recent commit')
        .mockResolvedValueOnce('def5678901234|2025-01-01 09:00:00 -0500|Jane Smith|Old commit');
      
      // Mock branch contains
      mockGit.raw
        .mockResolvedValueOnce('') // Recent commit is unreachable
        .mockResolvedValueOnce(''); // Old commit is unreachable
      
      await recoveryFindCommitsCommand({ since: '2025-07-01' });
      
      // Should only show the recent commit
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.yellow('\n🔍 Found 1 commit(s) that might be lost:\n')
      );
    });

    it('should show all commits when all option is true', async () => {
      const reflogOutput = 'abc1234 HEAD@{0}: commit: Fix bug';
      mockGit.raw.mockResolvedValueOnce(reflogOutput);
      
      mockGit.show.mockResolvedValueOnce('abc1234567890|2025-07-23 10:00:00 -0500|John Doe|Fix bug');
      
      // Mock branch contains (has branches = reachable)
      mockGit.raw.mockResolvedValueOnce('  main\n  feature-branch');
      
      await recoveryFindCommitsCommand({ all: true });
      
      // Should show even reachable commits when all is true
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.yellow('\n🔍 Found 1 commit(s) that might be lost:\n')
      );
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Git error');
      mockGit.raw.mockRejectedValue(error);
      
      await recoveryFindCommitsCommand();
      
      expect(mockConsoleError).toHaveBeenCalledWith(chalk.red('Error:'), 'Git error');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('recoveryRestoreCommand', () => {
    const mockCommitHash = 'abc1234567890';
    const mockCommitRef = 'abc1234';
    
    beforeEach(() => {
      mockGit.revparse.mockResolvedValueOnce(mockCommitHash); // revparse
      mockGit.show.mockResolvedValueOnce('abc1234567890|2025-07-23 10:00:00 -0500|John Doe|Fix bug');
      mockGit.show.mockResolvedValueOnce('M\tfile1.js\nA\tfile2.js'); // name-status
    });

    it('should restore commit using cherry-pick', async () => {
      inquirer.prompt.mockResolvedValueOnce({ method: 'cherry-pick' });
      mockGit.raw.mockResolvedValueOnce(); // cherry-pick success
      
      await recoveryRestoreCommand(mockCommitRef);
      
      expect(gitOps.validateRepository).toHaveBeenCalled();
      expect(mockGit.raw).toHaveBeenCalledWith(['cherry-pick', mockCommitHash]);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.green('\n✅ Successfully restored: Fix bug')
      );
    });

    it('should create new branch when createBranch option is true', async () => {
      inquirer.prompt.mockResolvedValueOnce({ branchName: 'recovery-fix-bug' });
      mockGit.checkout.mockResolvedValueOnce();
      
      await recoveryRestoreCommand(mockCommitRef, { createBranch: true });
      
      expect(inquirer.prompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'branchName',
            message: 'New branch name:'
          })
        ])
      );
      expect(mockGit.checkout).toHaveBeenCalledWith(['-b', 'recovery-fix-bug', mockCommitHash]);
    });

    it('should handle cherry-pick conflicts', async () => {
      inquirer.prompt.mockResolvedValueOnce({ method: 'cherry-pick' });
      const conflictError = new Error('conflict');
      mockGit.raw.mockRejectedValueOnce(conflictError);
      
      await recoveryRestoreCommand(mockCommitRef);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.yellow('\n⚠️  Cherry-pick resulted in conflicts')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.gray('  git cherry-pick --continue')
      );
    });

    it('should handle errors', async () => {
      // Clear the mocks set in beforeEach
      mockGit.revparse.mockReset();
      mockGit.show.mockReset();
      
      const error = new Error('Invalid commit');
      mockGit.revparse.mockRejectedValueOnce(error); // revparse fails
      
      await recoveryRestoreCommand(mockCommitRef);
      
      expect(mockConsoleError).toHaveBeenCalledWith(chalk.red('Error:'), `Commit '${mockCommitRef}' not found`);
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('recoveryStashCommand', () => {
    it('should display no stashes message when none found', async () => {
      mockGit.stashList.mockResolvedValueOnce({ total: 0, all: [] });
      
      await recoveryStashCommand();
      
      expect(gitOps.validateRepository).toHaveBeenCalled();
      expect(mockGit.stashList).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.yellow('No stashes found.'));
    });

    it('should list stashes and apply when user selects apply', async () => {
      const mockStashList = {
        total: 2,
        all: [
          { hash: 'abc123', message: 'WIP on main: Fix bug', date: '2025-07-23' },
          { hash: 'def456', message: 'WIP on feature: Add feature', date: '2025-07-22' }
        ]
      };
      mockGit.stashList.mockResolvedValueOnce(mockStashList);
      inquirer.prompt
        .mockResolvedValueOnce({ stashIndex: 0 })
        .mockResolvedValueOnce({ restoreMethod: 'apply' });
      mockGit.stash.mockResolvedValueOnce();
      
      await recoveryStashCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.blue('\n📦 Found 2 stash(es):\n')
      );
      expect(mockGit.stash).toHaveBeenCalledWith(['apply', 'stash@{0}']);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.green('\n✅ Stash applied successfully')
      );
    });

    it('should pop stash when user selects pop', async () => {
      const mockStashList = {
        total: 1,
        all: [
          { hash: 'abc123', message: 'WIP on main: Fix bug', date: '2025-07-23' }
        ]
      };
      mockGit.stashList.mockResolvedValueOnce(mockStashList);
      inquirer.prompt
        .mockResolvedValueOnce({ stashIndex: 0 })
        .mockResolvedValueOnce({ restoreMethod: 'pop' });
      mockGit.stash.mockResolvedValueOnce();
      
      await recoveryStashCommand();
      
      expect(mockGit.stash).toHaveBeenCalledWith(['pop', 'stash@{0}']);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.green('\n✅ Stash popped successfully')
      );
    });

    it('should create branch from stash when user selects branch', async () => {
      const mockStashList = {
        total: 1,
        all: [
          { hash: 'abc123', message: 'WIP on main: Fix bug', date: '2025-07-23' }
        ]
      };
      mockGit.stashList.mockResolvedValueOnce(mockStashList);
      inquirer.prompt
        .mockResolvedValueOnce({ stashIndex: 0 })
        .mockResolvedValueOnce({ restoreMethod: 'branch' })
        .mockResolvedValueOnce({ branchName: 'stash-feature' });
      mockGit.stash.mockResolvedValueOnce();
      
      await recoveryStashCommand();
      
      expect(mockGit.stash).toHaveBeenCalledWith(['branch', 'stash-feature', 'stash@{0}']);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.green('\n✅ Created branch \'stash-feature\' from stash')
      );
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to get stash list');
      mockGit.stashList.mockRejectedValue(error);
      
      await recoveryStashCommand();
      
      expect(mockConsoleError).toHaveBeenCalledWith(chalk.red('Error:'), 'Failed to get stash list');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});