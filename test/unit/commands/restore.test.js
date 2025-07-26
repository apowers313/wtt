const { restoreCommand } = require('../../../commands/restore');
const BackupManager = require('../../../lib/merge-helper/backup-manager');
const MessageFormatter = require('../../../lib/merge-helper/message-formatter');
const gitOps = require('../../../lib/gitOps');
const config = require('../../../lib/config');
const OutputConfig = require('../../../lib/output-config');
const ProgressUI = require('../../../lib/ui/progress-ui');
const chalk = require('chalk');
const inquirer = require('inquirer');

jest.mock('../../../lib/merge-helper/backup-manager');
jest.mock('../../../lib/merge-helper/message-formatter');
jest.mock('../../../lib/gitOps');
jest.mock('../../../lib/config');
jest.mock('../../../lib/output-config');
jest.mock('../../../lib/ui/progress-ui');
jest.mock('inquirer');

describe('restore command', () => {
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

    // Mock gitOps
    gitOps.validateRepository = jest.fn().mockResolvedValue();
    gitOps.hasUncommittedChanges = jest.fn().mockResolvedValue(false);

    // Mock config
    config.load = jest.fn().mockResolvedValue();
    config.getBaseDir = jest.fn().mockReturnValue('/mock/base/dir');

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
      listBackups: jest.fn(),
      restoreFromBackup: jest.fn(),
      deleteBackup: jest.fn()
    };
    BackupManager.mockImplementation(() => mockBackupManager);

    // Mock message formatter
    mockMessageFormatter = {
      formatError: jest.fn(msg => msg),
      formatBackupList: jest.fn(backups => `Found ${backups.length} backups`)
    };
    MessageFormatter.mockImplementation(() => mockMessageFormatter);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    mockProcessExit.mockRestore();
  });

  describe('restore with --last-backup', () => {
    it('should restore the most recent backup', async () => {
      const mockBackups = [
        {
          id: 'merge-2024-01-20T15-00-00-000Z',
          operation: 'merge',
          timestamp: '2024-01-20T15:00:00.000Z',
          branch: 'feature-new'
        },
        {
          id: 'merge-2024-01-20T10-00-00-000Z',
          operation: 'merge',
          timestamp: '2024-01-20T10:00:00.000Z',
          branch: 'feature-old'
        }
      ];

      mockBackupManager.listBackups.mockResolvedValue(mockBackups);
      mockBackupManager.restoreFromBackup.mockResolvedValue(mockBackups[0]);
      
      // Mock confirmation prompt
      inquirer.prompt = jest.fn().mockResolvedValue({ confirm: true });

      await restoreCommand({ lastBackup: true });

      expect(mockBackupManager.listBackups).toHaveBeenCalled();
      
      expect(mockBackupManager.restoreFromBackup).toHaveBeenCalledWith(
        'merge-2024-01-20T15-00-00-000Z',
        { keepChanges: false }
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.green('✅ Successfully restored from backup')
      );
    });

    it('should handle no backups available', async () => {
      mockBackupManager.listBackups.mockResolvedValue([]);

      await restoreCommand({ lastBackup: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow('⚠️  No backups found')
      );
      expect(mockBackupManager.restoreFromBackup).not.toHaveBeenCalled();
    });

    it('should use keepChanges option when provided', async () => {
      const mockBackups = [{
        id: 'backup-123',
        operation: 'merge',
        timestamp: new Date().toISOString()
      }];

      mockBackupManager.listBackups.mockResolvedValue(mockBackups);
      mockBackupManager.restoreFromBackup.mockResolvedValue(mockBackups[0]);
      
      // Mock confirmation prompt
      inquirer.prompt = jest.fn().mockResolvedValue({ confirm: true });

      await restoreCommand({ lastBackup: true, keepChanges: true });

      expect(mockBackupManager.restoreFromBackup).toHaveBeenCalledWith(
        'backup-123',
        { keepChanges: true }
      );
    });
  });

  describe('restore with --backup <id>', () => {
    it('should restore specific backup by ID', async () => {
      const mockBackup = {
        id: 'merge-specific-123',
        operation: 'merge-abort',
        branch: 'feature-test'
      };

      mockBackupManager.restoreFromBackup.mockResolvedValue(mockBackup);

      await restoreCommand({ backup: 'merge-specific-123' });

      expect(mockBackupManager.restoreFromBackup).toHaveBeenCalledWith(
        'merge-specific-123',
        { keepChanges: false }
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.green('✅ Successfully restored from backup')
      );
    });

    it('should handle backup not found error', async () => {
      mockBackupManager.restoreFromBackup.mockRejectedValue(
        new Error('Backup \'invalid-id\' not found')
      );

      await restoreCommand({ backup: 'invalid-id' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red('❌ Restoration failed:'),
        'Backup \'invalid-id\' not found'
      );
    });
  });

  describe('interactive restore', () => {
    it('should show backup list and restore selected', async () => {
      const mockBackups = [
        {
          id: 'merge-2024-01-20T15-00-00-000Z',
          operation: 'merge',
          timestamp: '2024-01-20T15:00:00.000Z',
          branch: 'feature-a',
          commit: 'abc123'
        },
        {
          id: 'merge-abort-2024-01-20T14-00-00-000Z',
          operation: 'merge-abort',
          timestamp: '2024-01-20T14:00:00.000Z',
          branch: 'feature-b',
          commit: 'def456'
        }
      ];

      mockBackupManager.listBackups.mockResolvedValue(mockBackups);
      
      // Mock user selecting first backup
      inquirer.prompt.mockResolvedValue({
        selectedBackup: 'merge-2024-01-20T15-00-00-000Z'
      });

      mockBackupManager.restoreFromBackup.mockResolvedValue(mockBackups[0]);

      await restoreCommand({});

      expect(mockMessageFormatter.formatBackupList).toHaveBeenCalledWith(mockBackups);
      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'list',
        name: 'selectedBackup',
        message: 'Select a backup to restore:',
        choices: [
          {
            name: 'merge (feature-a - abc123) - 1/20/2024',
            value: 'merge-2024-01-20T15-00-00-000Z',
            short: 'merge-2024-01-20T15-00-00-000Z'
          },
          {
            name: 'merge-abort (feature-b - def456) - 1/20/2024',
            value: 'merge-abort-2024-01-20T14-00-00-000Z',
            short: 'merge-abort-2024-01-20T14-00-00-000Z'
          },
          {
            name: 'Cancel',
            value: null
          }
        ],
        pageSize: 10
      }]);
      expect(mockBackupManager.restoreFromBackup).toHaveBeenCalledWith(
        'merge-2024-01-20T15-00-00-000Z',
        { keepChanges: false }
      );
    });

    it('should handle no backups in interactive mode', async () => {
      mockBackupManager.listBackups.mockResolvedValue([]);

      await restoreCommand({});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow('⚠️  No backups found')
      );
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it('should format backup choices correctly', async () => {
      const mockBackups = [
        {
          id: 'merge-2024-01-20T15-30-45-123Z',
          operation: 'merge',
          timestamp: '2024-01-20T15:30:45.123Z',
          branch: 'develop',
          commit: 'abc123def',
          metadata: { targetBranch: 'main' }
        }
      ];

      mockBackupManager.listBackups.mockResolvedValue(mockBackups);
      inquirer.prompt.mockResolvedValue({
        selectedBackup: mockBackups[0].id
      });
      mockBackupManager.restoreFromBackup.mockResolvedValue(mockBackups[0]);

      await restoreCommand({});

      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'list',
        name: 'selectedBackup',
        message: 'Select a backup to restore:',
        choices: [
          {
            name: 'merge (develop - abc123d) - 1/20/2024',
            value: 'merge-2024-01-20T15-30-45-123Z',
            short: 'merge-2024-01-20T15-30-45-123Z'
          },
          {
            name: 'Cancel',
            value: null
          }
        ],
        pageSize: 10
      }]);
    });
  });

  describe('restore with deletion', () => {
    it('should delete backup after successful restore when requested', async () => {
      const mockBackup = {
        id: 'backup-to-delete',
        operation: 'merge'
      };

      mockBackupManager.restoreFromBackup.mockResolvedValue(mockBackup);
      inquirer.prompt.mockResolvedValue({ deleteBackup: true });
      mockBackupManager.deleteBackup.mockResolvedValue();

      await restoreCommand({ backup: 'backup-to-delete' });

      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'confirm',
        name: 'deleteBackup',
        message: 'Delete this backup after restoration?',
        default: false
      }]);
      expect(mockBackupManager.deleteBackup).toHaveBeenCalledWith('backup-to-delete');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('   Backup deleted')
      );
    });

    it('should not delete backup when user declines', async () => {
      const mockBackup = {
        id: 'backup-to-keep',
        operation: 'merge'
      };

      mockBackupManager.restoreFromBackup.mockResolvedValue(mockBackup);
      inquirer.prompt.mockResolvedValue({ deleteBackup: false });

      await restoreCommand({ backup: 'backup-to-keep' });

      expect(mockBackupManager.deleteBackup).not.toHaveBeenCalled();
    });

    it('should handle deletion errors gracefully', async () => {
      const mockBackup = {
        id: 'backup-delete-error',
        operation: 'merge'
      };

      mockBackupManager.restoreFromBackup.mockResolvedValue(mockBackup);
      inquirer.prompt.mockResolvedValue({ deleteBackup: true });
      mockBackupManager.deleteBackup.mockRejectedValue(new Error('Delete failed'));

      await restoreCommand({ backup: 'backup-delete-error' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow('   Warning: Could not delete backup:'),
        'Delete failed'
      );
      // Should still show success for restoration
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.green('✅ Successfully restored from backup')
      );
    });
  });

  describe('error handling', () => {
    it('should handle restoration errors', async () => {
      mockBackupManager.restoreFromBackup.mockRejectedValue(
        new Error('Restoration failed: Git error')
      );

      await restoreCommand({ backup: 'some-backup' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red('❌ Restoration failed:'),
        'Restoration failed: Git error'
      );
    });

    it('should handle list backups error', async () => {
      mockBackupManager.listBackups.mockRejectedValue(
        new Error('Cannot read backup directory')
      );

      await restoreCommand({ lastBackup: true });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red('❌ Failed to list backups:'),
        'Cannot read backup directory'
      );
    });
  });

  describe('backup info display', () => {
    it('should display detailed backup info after restoration', async () => {
      const mockBackup = {
        id: 'detailed-backup',
        operation: 'merge',
        branch: 'feature-xyz',
        commit: 'abc123def456',
        timestamp: '2024-01-20T10:30:00.000Z',
        uncommittedChanges: { saved: true },
        stashes: { saved: true, count: 3 },
        metadata: {
          targetBranch: 'develop',
          conflictCount: 5
        }
      };

      mockBackupManager.listBackups.mockResolvedValue([mockBackup]);
      mockBackupManager.restoreFromBackup.mockResolvedValue(mockBackup);

      await restoreCommand({ backup: 'detailed-backup' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('   Branch: feature-xyz')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('   Commit: abc123def456')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('   Operation: merge')
      );
    });
  });
});