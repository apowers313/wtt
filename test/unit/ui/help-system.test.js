const chalk = require('chalk');
const inquirer = require('inquirer');
const { HelpSystem, getInstance } = require('../../../lib/ui/help-system');

jest.mock('inquirer', () => ({
  prompt: jest.fn(),
  Separator: jest.fn(() => ({ type: 'separator' }))
}));

describe('HelpSystem', () => {
  let helpSystem;
  let mockConsoleLog;
  let mockConsoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    
    helpSystem = new HelpSystem();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with help topics', () => {
      expect(helpSystem.topics).toHaveProperty('merge-conflicts');
      expect(helpSystem.topics).toHaveProperty('lost-work');
      expect(helpSystem.topics).toHaveProperty('conflict-resolution');
      expect(helpSystem.topics).toHaveProperty('merge-strategy');
      expect(Object.keys(helpSystem.topics).length).toBeGreaterThan(0);
    });
  });

  describe('showHelp', () => {
    it('should show help for a specific topic', async () => {
      await helpSystem.showHelp('merge-conflicts');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.bold.blue('\n📚 Understanding Merge Conflicts\n')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('What are merge conflicts?')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.bold('\n🔧 Related commands:')
      );
    });

    it('should handle non-existent topic', async () => {
      await helpSystem.showHelp('non-existent');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.red('Unknown help topic: non-existent')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.bold.blue('\n📚 Available help topics:\n')
      );
    });
  });

  describe('browse', () => {
    it('should allow browsing multiple topics', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ choice: 'merge-conflicts' })
        .mockResolvedValueOnce({ action: 'browse' })
        .mockResolvedValueOnce({ choice: 'lost-work' })
        .mockResolvedValueOnce({ action: 'exit' });
      
      await helpSystem.browse();
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Understanding Merge Conflicts')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Recovering Lost Work')
      );
    });

    it('should exit when user chooses exit', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ choice: 'exit' });
      
      await helpSystem.browse();
      
      expect(inquirer.prompt).toHaveBeenCalledTimes(1);
    });
  });

  describe('showTopicList', () => {
    it('should display available topics', async () => {
      await helpSystem.showTopicList();
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.bold.blue('\n📚 Available help topics:\n')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('merge-conflicts')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Understanding Merge Conflicts')
      );
    });
  });

  describe('getContextualHelp', () => {
    it('should suggest conflict resolution help when conflicts exist', () => {
      const context = { hasConflicts: true };
      
      const suggestions = helpSystem.getContextualHelp(context);
      
      expect(suggestions).toContainEqual({
        topic: 'conflict-resolution',
        reason: 'You have merge conflicts to resolve'
      });
    });

    it('should suggest merge conflicts help on merge error', () => {
      const context = { mergeError: true };
      
      const suggestions = helpSystem.getContextualHelp(context);
      
      expect(suggestions).toContainEqual({
        topic: 'merge-conflicts',
        reason: 'Understanding why merges fail'
      });
    });

    it('should suggest lost work help when work is lost', () => {
      const context = { lostWork: true };
      
      const suggestions = helpSystem.getContextualHelp(context);
      
      expect(suggestions).toContainEqual({
        topic: 'lost-work',
        reason: 'Help finding lost commits'
      });
    });

    it('should return empty array for no context', () => {
      const context = {};
      
      const suggestions = helpSystem.getContextualHelp(context);
      
      expect(suggestions).toEqual([]);
    });

    it('should return multiple suggestions for multiple issues', () => {
      const context = {
        hasConflicts: true,
        mergeError: true,
        lostWork: true
      };
      
      const suggestions = helpSystem.getContextualHelp(context);
      
      expect(suggestions).toHaveLength(3);
    });
  });

  describe('getQuickHelp', () => {
    it('should return quick help for known topics', () => {
      expect(helpSystem.getQuickHelp('uncommitted-changes'))
        .toBe('Save with "wt stash" or commit with "wt commit -m"');
      
      expect(helpSystem.getQuickHelp('merge-conflict'))
        .toBe('Run "wt conflicts fix" to resolve interactively');
      
      expect(helpSystem.getQuickHelp('lost-commit'))
        .toBe('Use "wt recovery find-commits" to search for lost work');
      
      expect(helpSystem.getQuickHelp('backup-needed'))
        .toBe('Create a backup with "wt backup create"');
    });

    it('should return default help for unknown topics', () => {
      expect(helpSystem.getQuickHelp('unknown-topic'))
        .toBe('Run "wt help" for assistance');
    });
  });
});

describe('HelpSystem module exports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = getInstance();
      const instance2 = getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(HelpSystem);
    });
  });
});