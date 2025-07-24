const panicCommand = require('../../../commands/panic');
const chalk = require('chalk');
const inquirer = require('inquirer');
const BackupManager = require('../../../lib/merge-helper/backup-manager');
const config = require('../../../lib/config');
const gitOps = require('../../../lib/gitOps');
const simpleGit = require('simple-git');
const fs = require('fs-extra');

// Mock all dependencies
jest.mock('chalk', () => ({
  yellow: Object.assign(jest.fn(msg => msg), {
    bold: jest.fn(msg => msg)
  }),
  cyan: jest.fn(msg => msg),
  red: Object.assign(jest.fn(msg => msg), {
    bold: jest.fn(msg => msg)
  }),
  gray: jest.fn(msg => msg),
  green: jest.fn(msg => msg),
  blue: jest.fn(msg => msg)
}));

jest.mock('inquirer');
jest.mock('../../../lib/merge-helper/backup-manager');
jest.mock('../../../lib/config');
jest.mock('../../../lib/gitOps');
jest.mock('simple-git');
jest.mock('fs-extra');

describe('panic command', () => {
  let mockConsoleLog;
  let mockConsoleError;
  let mockGit;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    
    // Default mocks
    gitOps.validateRepository = jest.fn().mockResolvedValue();
    config.load = jest.fn().mockResolvedValue();
    config.getBaseDir = jest.fn().mockReturnValue('/test/repo/.worktrees');
    
    mockGit = {
      status: jest.fn().mockResolvedValue({
        conflicted: [],
        deleted: [],
        modified: [],
        not_added: [],
        current: 'main',
        files: []
      }),
      merge: jest.fn().mockResolvedValue(),
      reset: jest.fn().mockResolvedValue()
    };
    simpleGit.mockReturnValue(mockGit);
    
    BackupManager.mockImplementation(() => ({
      createSafetyBackup: jest.fn().mockResolvedValue({
        id: 'backup-123',
        timestamp: new Date().toISOString()
      }),
      backupDir: '/test/repo/.worktrees/.backups'
    }));
    
    fs.pathExists = jest.fn().mockResolvedValue(true);
    fs.readdir = jest.fn().mockResolvedValue([]);
    fs.readJSON = jest.fn().mockResolvedValue({
      timestamp: new Date().toISOString(),
      branch: 'test-branch'
    });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('main command', () => {
    it('should display emergency mode message and prompt for problem', async () => {
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'other' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🚨 Emergency Mode - Let\'s fix this step by step\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('Don\'t worry! Your work is safe and we can recover from this.\n');
      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'list',
        name: 'problem',
        message: 'What went wrong?',
        choices: expect.arrayContaining([
          expect.objectContaining({ value: 'merge-conflicts' }),
          expect.objectContaining({ value: 'lost-work' }),
          expect.objectContaining({ value: 'broken' })
        ])
      }]);
    });

    it('should handle repository validation errors', async () => {
      gitOps.validateRepository = jest.fn().mockRejectedValue(new Error('Not a git repository'));
      
      await panicCommand();
      
      expect(mockConsoleError).toHaveBeenCalledWith('\nError in panic mode:', 'Not a git repository');
      expect(mockConsoleLog).toHaveBeenCalledWith('\nIf you\'re still stuck, try these commands:');
    });
  });

  describe('handleMergeConflicts', () => {
    it('should check for conflicts and display options', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: ['src/app.js', 'README.md'],
        files: [],
        current: 'main'
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'merge-conflicts' })
        .mockResolvedValueOnce({ choice: 'resolve' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n📋 Let\'s check your merge conflicts...\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('Found 2 file(s) with conflicts:\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('  ❌ src/app.js');
      expect(mockConsoleLog).toHaveBeenCalledWith('  ❌ README.md');
    });

    it('should handle preview conflict option', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: ['src/app.js'],
        files: [],
        current: 'main'
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'merge-conflicts' })
        .mockResolvedValueOnce({ choice: 'preview' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n💡 To see conflicts in detail:');
      expect(mockConsoleLog).toHaveBeenCalledWith('Run: wt conflicts list --verbose');
    });

    it('should handle help option', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: ['src/app.js'],
        files: [],
        current: 'main'
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'merge-conflicts' })
        .mockResolvedValueOnce({ choice: 'help' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n📚 Merge conflicts happen when:');
      expect(mockConsoleLog).toHaveBeenCalledWith('- Two people change the same line of code differently');
    });

    it('should report when no conflicts are found', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: [],
        files: [],
        current: 'main'
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'merge-conflicts' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Good news! No conflicts found.');
      expect(mockConsoleLog).toHaveBeenCalledWith('Your merge might have already been resolved.');
    });

    it('should handle abort merge option', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: ['src/app.js'],
        files: [],
        current: 'main'
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'merge-conflicts' })
        .mockResolvedValueOnce({ choice: 'abort' });
      
      await panicCommand();
      
      expect(mockGit.merge).toHaveBeenCalledWith(['--abort']);
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Merge cancelled! You\'re back to where you started.');
    });
  });

  describe('handleLostWork', () => {
    it('should search for backups and display them', async () => {
      fs.readdir.mockResolvedValue([
        'merge-backup-123',
        'operation-backup-456',
        'other-file.txt'
      ]);
      
      fs.readJSON.mockImplementation((path) => {
        if (path.includes('merge-backup-123')) {
          return Promise.resolve({
            timestamp: '2024-01-01T10:00:00Z',
            branch: 'feature-branch'
          });
        }
        return Promise.resolve({
          timestamp: '2024-01-01T11:00:00Z',
          branch: 'test-branch'
        });
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'lost-work' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🔍 Let\'s find your lost work...\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Found 2 backup(s):\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('  📁 operation-backup-456');
    });

    it('should handle no backups found', async () => {
      fs.readdir.mockResolvedValue([]);
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'lost-work' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🔍 Checking git history...\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('💡 To see recent commits (including "lost" ones):');
    });
  });

  describe('handleBrokenState', () => {
    it('should diagnose current state and show options', async () => {
      mockGit.status.mockResolvedValue({
        current: 'feature-branch',
        modified: ['file1.js', 'file2.js'],
        conflicted: ['conflict.js'],
        not_added: ['new.js'],
        files: []
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'broken' })
        .mockResolvedValueOnce({ choice: 'show-changes' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🔧 Let\'s diagnose what\'s wrong...\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('Current state:');
      expect(mockConsoleLog).toHaveBeenCalledWith('  Branch: feature-branch');
      expect(mockConsoleLog).toHaveBeenCalledWith('  Modified files: 2');
      expect(mockConsoleLog).toHaveBeenCalledWith('  Conflicted files: 1');
      expect(mockConsoleLog).toHaveBeenCalledWith('  Untracked files: 1');
    });

    it('should handle save and reset option', async () => {
      const mockBackupManager = {
        createSafetyBackup: jest.fn().mockResolvedValue({
          id: 'panic-save-123',
          timestamp: new Date().toISOString()
        })
      };
      BackupManager.mockImplementation(() => mockBackupManager);
      
      mockGit.status.mockResolvedValue({
        current: 'main',
        modified: [],
        conflicted: [],
        not_added: [],
        files: []
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'broken' })
        .mockResolvedValueOnce({ choice: 'save-and-reset' });
      
      await panicCommand();
      
      expect(mockBackupManager.createSafetyBackup).toHaveBeenCalledWith('panic-save');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n✅ Your work has been saved!');
    });
  });

  describe('handleStartOver', () => {
    it('should create backup before reset', async () => {
      const mockBackupManager = {
        createSafetyBackup: jest.fn().mockResolvedValue({
          id: 'start-over-123',
          timestamp: new Date().toISOString()
        })
      };
      BackupManager.mockImplementation(() => mockBackupManager);
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'start-over' })
        .mockResolvedValueOnce({ proceed: true })
        .mockResolvedValueOnce({ choice: 'reset-hard' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n⚠️  Starting over will reset your current work.\n');
      expect(mockBackupManager.createSafetyBackup).toHaveBeenCalledWith('start-over');
      expect(mockGit.reset).toHaveBeenCalledWith(['--hard', 'HEAD']);
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Reset complete! You have a clean slate.');
    });

    it('should handle soft reset option', async () => {
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'start-over' })
        .mockResolvedValueOnce({ proceed: false })
        .mockResolvedValueOnce({ choice: 'reset-soft' });
      
      await panicCommand();
      
      expect(mockGit.reset).toHaveBeenCalledWith(['HEAD']);
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Reset complete! Your changes are preserved as uncommitted.');
    });

    it('should handle merge abort option', async () => {
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'start-over' })
        .mockResolvedValueOnce({ proceed: false })
        .mockResolvedValueOnce({ choice: 'merge-abort' });
      
      await panicCommand();
      
      expect(mockGit.merge).toHaveBeenCalledWith(['--abort']);
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Merge cancelled!');
    });

    it('should handle merge abort when no merge in progress', async () => {
      mockGit.merge.mockRejectedValue(new Error('No merge in progress'));
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'start-over' })
        .mockResolvedValueOnce({ proceed: false })
        .mockResolvedValueOnce({ choice: 'merge-abort' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('No merge in progress.');
    });
  });

  describe('handleFailedMerge', () => {
    it('should check merge status and delegate to conflict handler', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: ['file.js'],
        files: [],
        current: 'main'
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'merge-failed' })
        .mockResolvedValueOnce({ choice: 'resolve' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🔍 Checking merge status...\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('Found 1 file(s) with conflicts:\n');
    });

    it('should provide help when no active merge', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: [],
        files: [],
        current: 'main'
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'merge-failed' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('No active merge found.');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n💡 If a merge failed earlier:');
    });
  });

  describe('handleAccidentalDeletion', () => {
    it('should show deleted files', async () => {
      mockGit.status.mockResolvedValue({
        deleted: ['important.js', 'config.json'],
        files: [],
        current: 'main'
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'deleted' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🔍 Looking for deleted files...\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('Found 2 deleted file(s):\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('  ❌ important.js');
      expect(mockConsoleLog).toHaveBeenCalledWith('  ❌ config.json');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n💡 To restore deleted files:');
    });

    it('should handle no deleted files', async () => {
      mockGit.status.mockResolvedValue({
        deleted: [],
        files: [],
        current: 'main'
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'deleted' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ No deleted files in current changes.');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n💡 To find files deleted in past commits:');
    });
  });

  describe('edge cases', () => {
    it('should handle cancel option in handleStartOver', async () => {
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'start-over' })
        .mockResolvedValueOnce({ proceed: false })
        .mockResolvedValueOnce({ choice: 'cancel' });
      
      await panicCommand();
      
      // Should not perform any git operations
      expect(mockGit.reset).not.toHaveBeenCalled();
      expect(mockGit.merge).not.toHaveBeenCalled();
    });

    it('should handle no backups directory exists', async () => {
      fs.pathExists.mockResolvedValue(false);
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'lost-work' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🔍 Checking git history...\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('💡 To see recent commits (including "lost" ones):');
    });

    it('should handle restore backup option in broken state', async () => {
      mockGit.status.mockResolvedValue({
        current: 'main',
        modified: [],
        conflicted: [],
        not_added: [],
        files: []
      });
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'broken' })
        .mockResolvedValueOnce({ choice: 'restore-backup' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n💡 To restore from backup:');
      expect(mockConsoleLog).toHaveBeenCalledWith('   wt restore --last-backup');
    });

    it('should handle file read errors for backup info', async () => {
      fs.readdir.mockResolvedValue(['backup-123']);
      fs.readJSON.mockRejectedValue(new Error('File not found'));
      
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'lost-work' });
      
      await panicCommand();
      
      // Should continue without crashing
      expect(mockConsoleLog).toHaveBeenCalledWith('\n🔍 Checking git history...\n');
    });
  });

  describe('handleOther', () => {
    it('should display helpful commands', async () => {
      inquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ problem: 'other' });
      
      await panicCommand();
      
      expect(mockConsoleLog).toHaveBeenCalledWith('\n📚 Here are some helpful commands:\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('Check current state:');
      expect(mockConsoleLog).toHaveBeenCalledWith('\nFix common issues:');
      expect(mockConsoleLog).toHaveBeenCalledWith('\nGet help:');
    });
  });
});