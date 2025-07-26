const { saveWorkCommand, restoreWorkCommand, listStashCommand } = require('../../../commands/stash');
const MessageFormatter = require('../../../lib/merge-helper/message-formatter');
const gitOps = require('../../../lib/gitOps');
const config = require('../../../lib/config');
const OutputConfig = require('../../../lib/output-config');
const simpleGit = require('simple-git');
const chalk = require('chalk');

jest.mock('../../../lib/merge-helper/message-formatter');
jest.mock('../../../lib/gitOps');
jest.mock('../../../lib/config');
jest.mock('../../../lib/output-config');
jest.mock('simple-git');

describe('stash commands', () => {
  let mockGit;
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
      stash: jest.fn(),
      stashList: jest.fn(),
      raw: jest.fn()
    };
    simpleGit.mockReturnValue(mockGit);

    // Mock gitOps
    gitOps.ensureGit = jest.fn().mockResolvedValue(mockGit);
    gitOps.validateRepository = jest.fn().mockResolvedValue();

    // Mock config
    config.load = jest.fn().mockResolvedValue();

    // Mock OutputConfig
    OutputConfig.isVerbose = jest.fn().mockReturnValue(false);

    // Mock message formatter
    mockMessageFormatter = {
      formatStashError: jest.fn(msg => msg),
      formatStashList: jest.fn(stashes => `Found ${stashes.length} stashes`),
      displayFormattedError: jest.fn()
    };
    MessageFormatter.mockImplementation(() => mockMessageFormatter);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    mockProcessExit.mockRestore();
  });

  describe('saveWorkCommand', () => {
    it('should save work when changes exist', async () => {
      mockGit.status.mockResolvedValue({
        files: [
          { path: 'src/index.js', working_dir: 'M' },
          { path: 'src/utils.js', working_dir: 'M' }
        ]
      });
      mockGit.stash.mockResolvedValue();

      await saveWorkCommand({ message: 'WIP: working on feature' });

      expect(mockGit.stash).toHaveBeenCalledWith(['push', '-m', 'WIP: working on feature']);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.green('✅ Work saved successfully!')
      );
    });

    it('should use default message when none provided', async () => {
      mockGit.status.mockResolvedValue({
        files: [{ path: 'file.js', working_dir: 'M' }]
      });
      mockGit.stash.mockResolvedValue();

      await saveWorkCommand({});

      expect(mockGit.stash).toHaveBeenCalledWith(['push', '-m', expect.stringContaining('Work in progress')]);
    });

    it('should handle no changes to save', async () => {
      mockGit.status.mockResolvedValue({
        files: []
      });

      await saveWorkCommand({});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow('No uncommitted changes to save.')
      );
      expect(mockGit.stash).not.toHaveBeenCalled();
    });

    it('should handle git stash errors', async () => {
      mockGit.status.mockResolvedValue({
        files: [{ path: 'file.js', working_dir: 'M' }]
      });
      mockGit.stash.mockRejectedValue(new Error('Stash failed'));

      await saveWorkCommand({});

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle git status errors', async () => {
      mockGit.status.mockRejectedValue(new Error('Status failed'));

      await saveWorkCommand({});

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should show verbose output when enabled', async () => {
      OutputConfig.isVerbose.mockReturnValue(true);
      mockGit.status.mockResolvedValue({
        files: [
          { path: 'file.js', working_dir: 'M', index: 'M' }
        ]
      });
      mockGit.stash.mockResolvedValue();

      await saveWorkCommand({});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.blue('Saving your current work...')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('Files to be saved: 1')
      );
    });
  });

  describe('restoreWorkCommand', () => {
    it('should restore latest work successfully', async () => {
      mockGit.stashList.mockResolvedValue({
        total: 1,
        all: [
          {
            hash: 'stash@{0}',
            message: 'WIP: latest work',
            refs: 'stash@{0}'
          }
        ]
      });
      mockGit.status.mockResolvedValue({ files: [] });
      mockGit.stash.mockResolvedValue();

      await restoreWorkCommand({});

      expect(mockGit.stash).toHaveBeenCalledWith(['pop', 'stash@{0}']);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.green('✅ Work restored successfully!')
      );
    });

    it('should handle no stashes available', async () => {
      mockGit.stashList.mockResolvedValue({
        total: 0,
        all: []
      });

      await restoreWorkCommand({});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow('No saved work to restore.')
      );
      expect(mockGit.stash).not.toHaveBeenCalled();
    });

    it('should handle uncommitted changes without force option', async () => {
      mockGit.stashList.mockResolvedValue({
        total: 1,
        all: [{ hash: 'stash@{0}', message: 'Test' }]
      });
      mockGit.status.mockResolvedValue({
        files: [{ path: 'modified.js', working_dir: 'M' }]
      });

      await restoreWorkCommand({});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow('⚠️  You have uncommitted changes that might conflict with the saved work.')
      );
      expect(mockGit.stash).not.toHaveBeenCalled();
    });

    it('should force restore when force option is provided', async () => {
      mockGit.stashList.mockResolvedValue({
        total: 1,
        all: [{ hash: 'stash@{0}', message: 'Test' }]
      });
      mockGit.status.mockResolvedValue({
        files: [{ path: 'modified.js', working_dir: 'M' }]
      });
      mockGit.stash.mockResolvedValue();

      await restoreWorkCommand({ force: true });

      expect(mockGit.stash).toHaveBeenCalledWith(['pop', 'stash@{0}']);
    });

    it('should restore specific stash by index', async () => {
      mockGit.stashList.mockResolvedValue({
        total: 2,
        all: [
          { hash: 'stash@{0}', message: 'Latest' },
          { hash: 'stash@{1}', message: 'Previous' }
        ]
      });
      mockGit.status.mockResolvedValue({ files: [] });
      mockGit.stash.mockResolvedValue();

      await restoreWorkCommand({ index: 1 });

      expect(mockGit.stash).toHaveBeenCalledWith(['pop', 'stash@{1}']);
    });

    it('should handle git stash restore errors', async () => {
      mockGit.stashList.mockResolvedValue({
        total: 1,
        all: [{ hash: 'stash@{0}', message: 'Test' }]
      });
      mockGit.status.mockResolvedValue({ files: [] });
      mockGit.stash.mockRejectedValue(new Error('Restore failed'));

      await restoreWorkCommand({});

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle stashList errors', async () => {
      mockGit.stashList.mockRejectedValue(new Error('List failed'));

      await restoreWorkCommand({});

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('listStashCommand', () => {
    it('should list all stashes', async () => {
      const mockStashes = [
        {
          hash: 'abc123',
          date: '2024-01-20 10:30:00 +0000',
          message: 'WIP: feature work',
          refs: 'stash@{0}',
          author_name: 'Test User'
        },
        {
          hash: 'def456',
          date: '2024-01-19 15:45:00 +0000',
          message: 'WIP: bug fix',
          refs: 'stash@{1}',
          author_name: 'Test User'
        }
      ];

      mockGit.stashList.mockResolvedValue({ 
        total: 2, 
        all: mockStashes 
      });

      await listStashCommand({});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.bold('\nSaved Work:\n')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('To restore saved work:')
      );
    });

    it('should show no stashes message when empty', async () => {
      mockGit.stashList.mockResolvedValue({ 
        total: 0, 
        all: [] 
      });

      await listStashCommand({});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('No saved work found.')
      );
    });

    it('should handle null stashList', async () => {
      mockGit.stashList.mockResolvedValue(null);

      await listStashCommand({});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('No saved work found.')
      );
    });

    it('should display stash details correctly', async () => {
      const mockStashes = [
        {
          hash: 'abc123',
          date: '2024-01-20 10:30:00',
          message: 'WIP: test work',
          branch: 'feature-branch'
        }
      ];

      mockGit.stashList.mockResolvedValue({ 
        total: 1, 
        all: mockStashes 
      });

      await listStashCommand({});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('WIP: test work')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('   Branch: feature-branch')
      );
    });

    it('should handle git stashList errors', async () => {
      mockGit.stashList.mockRejectedValue(new Error('List failed'));

      await listStashCommand({});

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('error handling integration', () => {
    it('should handle gitOps validation errors', async () => {
      gitOps.validateRepository.mockRejectedValue(new Error('Not a git repo'));

      await saveWorkCommand({});

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle config load errors', async () => {
      config.load.mockRejectedValue(new Error('Config load failed'));

      await saveWorkCommand({});

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should format errors using MessageFormatter', async () => {
      process.env.WTT_ERROR_LEVEL = 'enhanced';
      mockGit.status.mockRejectedValue(new Error('Test error'));
      const formattedError = { message: 'Formatted error' };
      mockMessageFormatter.formatStashError.mockReturnValue(formattedError);

      await saveWorkCommand({});

      expect(mockMessageFormatter.formatStashError).toHaveBeenCalledWith(expect.any(Error));
      expect(mockMessageFormatter.displayFormattedError).toHaveBeenCalledWith(
        formattedError,
        { verbose: undefined }
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should use simple error format when WTT_ERROR_LEVEL is simple', async () => {
      process.env.WTT_ERROR_LEVEL = 'simple';
      mockGit.status.mockRejectedValue(new Error('Simple test error'));

      await saveWorkCommand({});

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', 'Simple test error');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});