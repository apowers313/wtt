const { HelpSystem } = require('../../../lib/ui/help-system');
const chalk = require('chalk');
const inquirer = require('inquirer');

// Mock chalk to avoid ANSI color codes in tests
jest.mock('chalk', () => {
  const chalkMock = jest.fn(text => text);
  chalkMock.bold = jest.fn(text => text);
  chalkMock.cyan = jest.fn(text => text);
  chalkMock.gray = jest.fn(text => text);
  chalkMock.grey = jest.fn(text => text);
  chalkMock.red = jest.fn(text => text);
  chalkMock.blue = jest.fn(text => text);
  chalkMock.yellow = jest.fn(text => text);
  
  // Support chained methods
  chalkMock.bold.blue = jest.fn(text => text);
  chalkMock.bold.red = jest.fn(text => text);
  
  return chalkMock;
});

jest.mock('inquirer', () => ({
  prompt: jest.fn(),
  Separator: jest.fn()
}));

describe('HelpSystem', () => {
  let helpSystem;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    helpSystem = new HelpSystem();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('showTopicList', () => {
    it('should display main commands section', () => {
      helpSystem.showTopicList();

      expect(consoleLogSpy).toHaveBeenCalledWith('\nGit Worktree Tool (wt) - Help\n');
      expect(consoleLogSpy).toHaveBeenCalledWith('Main Commands:');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt init                     Initialize worktree configuration');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt create <branch>          Create a new worktree');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt list                     List all worktrees');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt switch <name>            Switch to a worktree');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt merge <name>             Merge worktree to main');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt remove <name>            Remove a worktree');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt ports                    Show port assignments');
    });

    it('should display utility commands section', () => {
      helpSystem.showTopicList();

      expect(consoleLogSpy).toHaveBeenCalledWith('\nUtility Commands:');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt save-work                Save uncommitted changes');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt restore-work             Restore saved changes');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt conflicts                Manage merge conflicts');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt recovery                 Recover lost work');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt restore                  Restore from backups');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt panic                    Emergency help');
    });

    it('should display troubleshooting topics section', () => {
      helpSystem.showTopicList();

      expect(consoleLogSpy).toHaveBeenCalledWith('\nTroubleshooting Topics:');
      expect(consoleLogSpy).toHaveBeenCalledWith('  merge-conflicts      Understanding Merge Conflicts');
      expect(consoleLogSpy).toHaveBeenCalledWith('  lost-work            Recovering Lost Work');
      expect(consoleLogSpy).toHaveBeenCalledWith('  conflict-resolution  Step-by-Step Conflict Resolution');
      expect(consoleLogSpy).toHaveBeenCalledWith('  merge-strategy       Choosing a Merge Strategy');
      expect(consoleLogSpy).toHaveBeenCalledWith('  backup-restore       Using Backups');
    });

    it('should display usage instructions', () => {
      helpSystem.showTopicList();

      expect(consoleLogSpy).toHaveBeenCalledWith('\nUsage:');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt <command> --help         Show detailed help for any command');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt help <topic>             Show help for troubleshooting topics');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt help --interactive       Browse help topics interactively');
    });

    it('should display examples section', () => {
      helpSystem.showTopicList();

      expect(consoleLogSpy).toHaveBeenCalledWith('\nExamples:');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt create --help              # Show options for create command');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt help merge-conflicts       # Learn about resolving conflicts');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt help lost-work             # Recover lost commits');
    });

    it('should display quick start section', () => {
      helpSystem.showTopicList();

      expect(consoleLogSpy).toHaveBeenCalledWith('\nQuick Start:');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt init                       # Set up worktrees in this repo');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt create my-feature          # Create worktree for my-feature branch');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt list                       # See all your worktrees');
    });

    it('should use colored output when chalk is available', () => {
      helpSystem.showTopicList();

      expect(chalk.bold).toHaveBeenCalledWith('\nGit Worktree Tool (wt) - Help\n');
      expect(chalk.bold).toHaveBeenCalledWith('Main Commands:');
      expect(chalk.cyan).toHaveBeenCalledWith('wt init');
      expect(chalk.cyan).toHaveBeenCalledWith('wt create <branch>');
      expect(chalk.gray).toHaveBeenCalledWith('wt init                       # Set up worktrees in this repo');
    });

    it('should include all required sections', () => {
      helpSystem.showTopicList();

      const allCalls = consoleLogSpy.mock.calls.map(call => call[0]);
      const output = allCalls.join('\n');

      expect(output).toContain('Git Worktree Tool (wt) - Help');
      expect(output).toContain('Main Commands:');
      expect(output).toContain('Utility Commands:');
      expect(output).toContain('Troubleshooting Topics:');
      expect(output).toContain('Usage:');
      expect(output).toContain('Examples:');
      expect(output).toContain('Quick Start:');
    });
  });

  describe('showHelp', () => {
    it('should display help for valid topic', async () => {
      await helpSystem.showHelp('merge-conflicts');

      expect(consoleLogSpy).toHaveBeenCalledWith('\n📚 Understanding Merge Conflicts\n');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('What are merge conflicts?'));
      expect(consoleLogSpy).toHaveBeenCalledWith('\n🔧 Related commands:');
      expect(consoleLogSpy).toHaveBeenCalledWith('  wt conflicts fix');
    });

    it('should display help for lost-work topic', async () => {
      await helpSystem.showHelp('lost-work');

      expect(consoleLogSpy).toHaveBeenCalledWith('\n📚 Recovering Lost Work\n');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Don\'t panic - Git rarely loses work!'));
      expect(consoleLogSpy).toHaveBeenCalledWith('\n🔧 Related commands:');
    });

    it('should show topic list for invalid topic', async () => {
      await helpSystem.showHelp('invalid-topic');

      expect(consoleLogSpy).toHaveBeenCalledWith('Unknown help topic: invalid-topic');
      expect(consoleLogSpy).toHaveBeenCalledWith('\nGit Worktree Tool (wt) - Help\n');
      expect(consoleLogSpy).toHaveBeenCalledWith('Main Commands:');
      expect(consoleLogSpy).toHaveBeenCalledWith('\nTroubleshooting Topics:');
    });

    it('should handle empty or null topic', async () => {
      await helpSystem.showHelp('');

      expect(consoleLogSpy).toHaveBeenCalledWith('Unknown help topic: ');
      expect(consoleLogSpy).toHaveBeenCalledWith('\nGit Worktree Tool (wt) - Help\n');
    });

    it('should use colored output for topic display', async () => {
      await helpSystem.showHelp('merge-conflicts');

      expect(chalk.bold.blue).toHaveBeenCalled();
      expect(chalk.bold).toHaveBeenCalled();
    });
  });

  describe('browse (interactive mode)', () => {
    beforeEach(() => {
      // Mock inquirer prompts
      inquirer.prompt = jest.fn();
    });

    it('should start interactive browsing and exit immediately', async () => {
      inquirer.prompt.mockResolvedValue({ choice: 'exit' });

      await helpSystem.browse();

      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'list',
        name: 'choice',
        message: 'What would you like help with?',
        choices: expect.arrayContaining([
          expect.objectContaining({ name: 'Understanding Merge Conflicts', value: 'merge-conflicts' }),
          expect.objectContaining({ name: 'Recovering Lost Work', value: 'lost-work' }),
          expect.objectContaining({ name: 'Exit help', value: 'exit' })
        ])
      }]);
    });

    it('should show topic and continue browsing', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ choice: 'merge-conflicts' })
        .mockResolvedValueOnce({ action: 'exit' });

      await helpSystem.browse();

      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy).toHaveBeenCalledWith('\n📚 Understanding Merge Conflicts\n');
      expect(inquirer.prompt).toHaveBeenNthCalledWith(2, [{
        type: 'list',
        name: 'action',
        message: 'What next?',
        choices: [
          { name: 'Browse another topic', value: 'browse' },
          { name: 'Exit help', value: 'exit' }
        ]
      }]);
    });

    it('should continue browsing when user chooses to browse another topic', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ choice: 'lost-work' })
        .mockResolvedValueOnce({ action: 'browse' })
        .mockResolvedValueOnce({ choice: 'exit' });

      await helpSystem.browse();

      expect(inquirer.prompt).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenCalledWith('\n📚 Recovering Lost Work\n');
    });

    it('should include all available topics in choices', async () => {
      inquirer.prompt.mockResolvedValue({ choice: 'exit' });

      await helpSystem.browse();

      const promptCall = inquirer.prompt.mock.calls[0][0][0];
      const topicChoices = promptCall.choices.filter(choice => choice.value !== 'exit' && choice.name !== undefined);
      
      expect(topicChoices).toHaveLength(5); // merge-conflicts, lost-work, conflict-resolution, merge-strategy, backup-restore
      expect(topicChoices.map(c => c.value)).toContain('merge-conflicts');
      expect(topicChoices.map(c => c.value)).toContain('lost-work');
      expect(topicChoices.map(c => c.value)).toContain('conflict-resolution');
      expect(topicChoices.map(c => c.value)).toContain('merge-strategy');
      expect(topicChoices.map(c => c.value)).toContain('backup-restore');
    });
  });

  describe('getContextualHelp', () => {
    it('should return suggestions for merge context', () => {
      const suggestions = helpSystem.getContextualHelp({ type: 'merge', conflictCount: 3 });

      expect(suggestions).toEqual([
        'Use "wt conflicts fix" to resolve conflicts interactively',
        'Run "wt help merge-conflicts" to understand merge conflicts',
        'Create a backup with "wt backup create" before continuing'
      ]);
    });

    it('should return suggestions for uncommitted changes context', () => {
      const suggestions = helpSystem.getContextualHelp({ type: 'uncommitted-changes', fileCount: 5 });

      expect(suggestions).toEqual([
        'Save changes with "wt save-work" before switching',
        'Commit changes with standard git commands',
        'Stash changes with "git stash" for quick storage'
      ]);
    });

    it('should return suggestions for lost work context', () => {
      const suggestions = helpSystem.getContextualHelp({ type: 'lost-work' });

      expect(suggestions).toEqual([
        'Use "wt recovery find-commits" to search for lost commits',
        'Check "wt recovery list-backups" for automatic backups',
        'Run "wt help lost-work" for detailed recovery steps'
      ]);
    });

    it('should return empty array for unknown context', () => {
      const suggestions = helpSystem.getContextualHelp({ type: 'unknown' });

      expect(suggestions).toEqual([]);
    });

    it('should handle missing context gracefully', () => {
      const suggestions = helpSystem.getContextualHelp({});

      expect(suggestions).toEqual([]);
    });
  });

  describe('getQuickHelp', () => {
    it('should return quick help for known topics', () => {
      expect(helpSystem.getQuickHelp('uncommitted-changes')).toBe('Save with "wt stash" or commit with "wt commit -m"');
      expect(helpSystem.getQuickHelp('merge-conflict')).toBe('Run "wt conflicts fix" to resolve interactively');
      expect(helpSystem.getQuickHelp('lost-commit')).toBe('Use "wt recovery find-commits" to search for lost work');
      expect(helpSystem.getQuickHelp('backup-needed')).toBe('Create a backup with "wt backup create"');
    });

    it('should return default help for unknown topics', () => {
      expect(helpSystem.getQuickHelp('unknown-topic')).toBe('Run "wt help" for assistance');
      expect(helpSystem.getQuickHelp('')).toBe('Run "wt help" for assistance');
      expect(helpSystem.getQuickHelp(null)).toBe('Run "wt help" for assistance');
    });
  });

  describe('topics configuration', () => {
    it('should have all expected topics defined', () => {
      const expectedTopics = [
        'merge-conflicts',
        'lost-work', 
        'conflict-resolution',
        'merge-strategy',
        'backup-restore'
      ];

      expectedTopics.forEach(topic => {
        expect(helpSystem.topics[topic]).toBeDefined();
        expect(helpSystem.topics[topic].title).toBeDefined();
        expect(helpSystem.topics[topic].content).toBeDefined();
      });
    });

    it('should have related commands for each topic', () => {
      Object.values(helpSystem.topics).forEach(topic => {
        expect(topic.relatedCommands).toBeDefined();
        expect(Array.isArray(topic.relatedCommands)).toBe(true);
        expect(topic.relatedCommands.length).toBeGreaterThan(0);
      });
    });

    it('should have non-empty content for each topic', () => {
      Object.values(helpSystem.topics).forEach(topic => {
        expect(topic.content.trim().length).toBeGreaterThan(0);
        expect(topic.title.trim().length).toBeGreaterThan(0);
      });
    });
  });

  describe('regression prevention', () => {
    it('should maintain consistent command list structure', () => {
      const expectedMainCommands = [
        'wt init',
        'wt create <branch>',
        'wt list',
        'wt switch <name>',
        'wt merge <name>',
        'wt remove <name>',
        'wt ports'
      ];

      const expectedUtilityCommands = [
        'wt save-work',
        'wt restore-work',
        'wt conflicts',
        'wt recovery',
        'wt restore',
        'wt panic'
      ];

      helpSystem.showTopicList();
      const allOutput = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');

      expectedMainCommands.forEach(command => {
        expect(allOutput).toContain(command);
      });

      expectedUtilityCommands.forEach(command => {
        expect(allOutput).toContain(command);
      });
    });

    it('should maintain all required sections in help output', () => {
      helpSystem.showTopicList();
      const allOutput = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');

      const requiredSections = [
        'Git Worktree Tool (wt) - Help',
        'Main Commands:',
        'Utility Commands:',
        'Troubleshooting Topics:',
        'Usage:',
        'Examples:',
        'Quick Start:'
      ];

      requiredSections.forEach(section => {
        expect(allOutput).toContain(section);
      });
    });

    it('should not show merge-only help anymore', () => {
      helpSystem.showTopicList();
      const allOutput = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');

      // Should show init, create, list commands - not just merge topics
      expect(allOutput).toContain('wt init');
      expect(allOutput).toContain('wt create');
      expect(allOutput).toContain('wt list');
      
      // Should still have troubleshooting but in separate section
      expect(allOutput).toContain('Troubleshooting Topics:');
      expect(allOutput).toContain('merge-conflicts');
    });

    it('should maintain backward compatibility with topic help', () => {
      // All existing topic help should still work
      const topics = ['merge-conflicts', 'lost-work', 'conflict-resolution', 'merge-strategy', 'backup-restore'];
      
      topics.forEach(async (topic) => {
        await helpSystem.showHelp(topic);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('📚'));
      });
    });
  });
});