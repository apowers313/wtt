const { mergeAbortCommand } = require('../../../commands/merge-abort');
const BackupManager = require('../../../lib/merge-helper/backup-manager');
const MessageFormatter = require('../../../lib/merge-helper/message-formatter');
const gitOps = require('../../../lib/gitOps');
const config = require('../../../lib/config');
const OutputConfig = require('../../../lib/output-config');
const ProgressUI = require('../../../lib/ui/progress-ui');
const simpleGit = require('simple-git');
const chalk = require('chalk');
const inquirer = require('inquirer');

jest.mock('../../../lib/merge-helper/backup-manager');
jest.mock('../../../lib/merge-helper/message-formatter');
jest.mock('../../../lib/gitOps');
jest.mock('../../../lib/config');
jest.mock('../../../lib/output-config');
jest.mock('../../../lib/ui/progress-ui');
jest.mock('simple-git');
jest.mock('inquirer');

describe('merge-abort command', () => {
  let mockGit;
  let mockBackupManager;
  let mockMessageFormatter;
  let consoleLogSpy;
  let consoleErrorSpy;
  let mockProcessExit;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

    // Mock git instance
    mockGit = {
      status: jest.fn(),
      merge: jest.fn(),
      raw: jest.fn()
    };
    simpleGit.mockReturnValue(mockGit);

    // Mock gitOps
    gitOps.ensureGit = jest.fn().mockResolvedValue(mockGit);
    gitOps.getMainRoot = jest.fn().mockResolvedValue('/test/repo');
    gitOps.validateRepository = jest.fn().mockResolvedValue();

    // Mock config
    config.load = jest.fn().mockResolvedValue();

    // Mock OutputConfig
    OutputConfig.isVerbose = jest.fn().mockReturnValue(false);

    // Mock ProgressUI
    const mockSpinner = {
      start: jest.fn(),
      stop: jest.fn(),
      fail: jest.fn()
    };
    ProgressUI.createSpinner = jest.fn().mockReturnValue(mockSpinner);

    // Mock backup manager
    mockBackupManager = {
      createSafetyBackup: jest.fn(),
      listBackups: jest.fn()
    };
    BackupManager.mockImplementation(() => mockBackupManager);

    // Mock message formatter
    mockMessageFormatter = {
      formatError: jest.fn(msg => msg),
      formatSuccess: jest.fn(msg => msg)
    };
    MessageFormatter.mockImplementation(() => mockMessageFormatter);
    
    // Mock inquirer
    inquirer.prompt = jest.fn().mockResolvedValue({ confirm: true });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    mockProcessExit.mockRestore();
  });

  describe('successful merge abort', () => {
    it('should abort merge with backup when in merge state', async () => {
      // Mock git status showing merge in progress
      mockGit.status.mockResolvedValue({
        conflicted: ['file1.js', 'file2.js'],
        merge: true
      });

      // Mock successful backup creation
      const mockBackup = {
        id: 'merge-abort-2024-01-01T10-00-00-000Z',
        operation: 'merge-abort',
        branch: 'feature-branch',
        commit: 'abc123',
        timestamp: '2024-01-01T10:00:00.000Z'
      };
      mockBackupManager.createSafetyBackup.mockResolvedValue(mockBackup);

      // Mock successful merge abort
      mockGit.merge.mockResolvedValue();

      await mergeAbortCommand();

      // Verify backup was created
      expect(mockBackupManager.createSafetyBackup).toHaveBeenCalledWith('merge-abort', {
        metadata: { reason: 'User requested merge abort' }
      });

      // Verify merge abort was called
      expect(mockGit.merge).toHaveBeenCalledWith(['--abort']);

      // Verify success message
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.green('✅ Merge aborted successfully'));
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.gray(`   Backup saved: ${mockBackup.id}`));
    });

    it('should work with force option', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: ['file1.js'],
        merge: true
      });

      const mockBackup = {
        id: 'merge-abort-force-123',
        operation: 'merge-abort'
      };
      mockBackupManager.createSafetyBackup.mockResolvedValue(mockBackup);
      mockGit.merge.mockResolvedValue();

      await mergeAbortCommand({ force: true });

      expect(mockBackupManager.createSafetyBackup).toHaveBeenCalledWith('merge-abort', {
        metadata: { 
          reason: 'User requested merge abort',
          force: true
        }
      });
    });
  });

  describe('error handling', () => {
    it('should handle not being in a merge state', async () => {
      // Mock git status showing no merge in progress
      mockGit.status.mockResolvedValue({
        conflicted: [],
        merge: false
      });

      await mergeAbortCommand();

      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.yellow('⚠️  No merge in progress'));
      expect(mockBackupManager.createSafetyBackup).not.toHaveBeenCalled();
      expect(mockGit.merge).not.toHaveBeenCalled();
    });

    it('should handle git status errors', async () => {
      mockGit.status.mockRejectedValue(new Error('Git status failed'));

      await mergeAbortCommand();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red('❌ Failed to check merge status:'),
        'Git status failed'
      );
    });

    it('should handle backup creation errors but still abort', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: ['file1.js'],
        merge: true
      });

      // Mock backup failure
      mockBackupManager.createSafetyBackup.mockRejectedValue(new Error('Backup failed'));
      mockGit.merge.mockResolvedValue();
      
      // Mock that user chooses to proceed without backup
      inquirer.prompt.mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ proceedWithoutBackup: true });

      await mergeAbortCommand();

      // Should warn about backup failure
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow('⚠️  Warning: Could not create backup:'),
        'Backup failed'
      );

      // Should still attempt merge abort
      expect(mockGit.merge).toHaveBeenCalledWith(['--abort']);
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.green('✅ Merge aborted successfully'));
    });

    it('should handle merge abort failure', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: ['file1.js'],
        merge: true
      });

      const mockBackup = {
        id: 'backup-123'
      };
      mockBackupManager.createSafetyBackup.mockResolvedValue(mockBackup);
      mockGit.merge.mockRejectedValue(new Error('Merge abort failed'));

      await mergeAbortCommand();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red('❌ Failed to abort merge:'),
        'Merge abort failed'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow('💾 Your changes are backed up with ID: backup-123')
      );
    });
  });

  describe('edge cases', () => {
    it('should handle status with conflicted files but no merge flag', async () => {
      // Some git versions might not set the merge flag properly
      mockGit.status.mockResolvedValue({
        conflicted: ['file1.js', 'file2.js'],
        merge: false
      });

      const mockBackup = { id: 'backup-456' };
      mockBackupManager.createSafetyBackup.mockResolvedValue(mockBackup);
      mockGit.merge.mockResolvedValue();

      await mergeAbortCommand();

      // Should still proceed if there are conflicted files
      expect(mockBackupManager.createSafetyBackup).toHaveBeenCalled();
      expect(mockGit.merge).toHaveBeenCalledWith(['--abort']);
    });

    it('should handle empty status response', async () => {
      mockGit.status.mockResolvedValue({});

      await mergeAbortCommand();

      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.yellow('⚠️  No merge in progress'));
    });

    it('should show proper message when no backup info returned', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: ['file1.js'],
        merge: true
      });

      // Backup created but returns undefined
      mockBackupManager.createSafetyBackup.mockResolvedValue(undefined);
      mockGit.merge.mockResolvedValue();

      await mergeAbortCommand();

      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.green('✅ Merge aborted successfully'));
      // Should not show backup ID if none provided
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Backup saved:'));
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex merge state with multiple conflicts', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: ['src/index.js', 'src/utils.js', 'README.md'],
        merge: true,
        modified: ['package.json'],
        staged: ['config.js']
      });

      const mockBackup = {
        id: 'complex-merge-backup',
        operation: 'merge-abort',
        uncommittedChanges: { saved: true },
        stashes: { saved: true, count: 2 }
      };
      mockBackupManager.createSafetyBackup.mockResolvedValue(mockBackup);
      mockGit.merge.mockResolvedValue();

      await mergeAbortCommand();

      expect(mockBackupManager.createSafetyBackup).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.blue('🔄 Aborting merge with 3 conflicted file(s)...')
      );
    });
  });
});