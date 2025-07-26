const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const execAsync = promisify(exec);

describe('help command integration', () => {
  let tempDir;
  const wtPath = path.join(__dirname, '../../wt.js');

  beforeEach(async () => {
    // Create a temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtt-help-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  describe('basic help command', () => {
    it('should show all commands when no arguments provided', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Git Worktree Tool (wt) - Help');
      expect(stdout).toContain('Main Commands:');
      expect(stdout).toContain('wt init');
      expect(stdout).toContain('wt create <branch>');
      expect(stdout).toContain('wt list');
      expect(stdout).toContain('wt switch <name>');
      expect(stdout).toContain('wt merge <name>');
      expect(stdout).toContain('wt remove <name>');
      expect(stdout).toContain('wt ports');
    });

    it('should show utility commands section', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Utility Commands:');
      expect(stdout).toContain('wt save-work');
      expect(stdout).toContain('wt restore-work');
      expect(stdout).toContain('wt conflicts');
      expect(stdout).toContain('wt recovery');
      expect(stdout).toContain('wt restore');
      expect(stdout).toContain('wt panic');
    });

    it('should show troubleshooting topics section', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Troubleshooting Topics:');
      expect(stdout).toContain('merge-conflicts');
      expect(stdout).toContain('lost-work');
      expect(stdout).toContain('conflict-resolution');
      expect(stdout).toContain('merge-strategy');
      expect(stdout).toContain('backup-restore');
    });

    it('should show usage instructions', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Usage:');
      expect(stdout).toContain('wt <command> --help');
      expect(stdout).toContain('wt help <topic>');
      expect(stdout).toContain('wt help --interactive');
    });

    it('should show examples and quick start', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Examples:');
      expect(stdout).toContain('Quick Start:');
      expect(stdout).toContain('wt init                       # Set up worktrees in this repo');
    });
  });

  describe('topic-specific help', () => {
    it('should show detailed help for merge-conflicts topic', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help merge-conflicts`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Understanding Merge Conflicts');
      expect(stdout).toContain('What are merge conflicts?');
      expect(stdout).toContain('Related commands:');
      expect(stdout).toContain('wt conflicts fix');
    });

    it('should show detailed help for lost-work topic', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help lost-work`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Recovering Lost Work');
      expect(stdout).toContain('Don\'t panic - Git rarely loses work!');
      expect(stdout).toContain('Related commands:');
    });

    it('should show detailed help for conflict-resolution topic', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help conflict-resolution`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Step-by-Step Conflict Resolution');
      expect(stdout).toContain('Related commands:');
    });

    it('should show detailed help for merge-strategy topic', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help merge-strategy`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Choosing a Merge Strategy');
      expect(stdout).toContain('Related commands:');
    });

    it('should show detailed help for backup-restore topic', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help backup-restore`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Using Backups');
      expect(stdout).toContain('Related commands:');
    });
  });

  describe('invalid topic handling', () => {
    it('should show error and command list for unknown topic', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help unknown-topic`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Unknown help topic: unknown-topic');
      expect(stdout).toContain('Git Worktree Tool (wt) - Help');
      expect(stdout).toContain('Main Commands:');
      expect(stdout).toContain('Troubleshooting Topics:');
    });

    it('should handle empty topic gracefully', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help ""`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      // Empty string now shows topic list instead of error (after our fix)
      expect(stdout).toContain('Git Worktree Tool (wt) - Help');
      expect(stdout).toContain('Main Commands:');
    });
  });

  describe('help command options', () => {
    it('should show help for help command with --help flag', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help --help`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Usage: wt help [options] [topic]');
      expect(stdout).toContain('Get help on specific topics');
      expect(stdout).toContain('-i, --interactive');
      expect(stdout).toContain('Browse help topics interactively');
    });

    it('should handle -h flag for help command', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} help -h`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Usage: wt help [options] [topic]');
      expect(stdout).toContain('-i, --interactive');
    });
  });

  describe('command-specific help', () => {
    it('should show help for create command', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} create --help`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Usage: wt create [options] <branch-name>');
      expect(stdout).toContain('Create a new worktree');
      expect(stdout).toContain('--from <base-branch>');
    });

    it('should show help for list command', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} list --help`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Usage: wt list [options]');
      expect(stdout).toContain('List all worktrees');
    });

    it('should show help for init command', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} init --help`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Usage: wt init [options]');
      expect(stdout).toContain('Initialize worktree configuration');
    });
  });

  describe('general CLI help', () => {
    it('should show main program help with --help', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} --help`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Git Worktree Tool - Streamline git worktree workflows');
      expect(stdout).toContain('Commands:');
      expect(stdout).toContain('init');
      expect(stdout).toContain('create');
      expect(stdout).toContain('list');
      expect(stdout).toContain('Examples:');
    });

    it('should show main program help with -h', async () => {
      const { stdout, stderr } = await execAsync(`node ${wtPath} -h`, {
        cwd: tempDir
      });

      expect(stderr).toBe('');
      expect(stdout).toContain('Git Worktree Tool - Streamline git worktree workflows');
      expect(stdout).toContain('Commands:');
    });
  });

  describe('regression prevention', () => {
    it('should always include essential commands in help output', async () => {
      const { stdout } = await execAsync(`node ${wtPath} help`, {
        cwd: tempDir
      });

      const essentialCommands = [
        'wt init',
        'wt create',
        'wt list',
        'wt switch',
        'wt merge',
        'wt remove',
        'wt ports'
      ];

      essentialCommands.forEach(command => {
        expect(stdout).toContain(command);
      });
    });

    it('should maintain all troubleshooting topics', async () => {
      const { stdout } = await execAsync(`node ${wtPath} help`, {
        cwd: tempDir
      });

      const topics = [
        'merge-conflicts',
        'lost-work',
        'conflict-resolution',
        'merge-strategy',
        'backup-restore'
      ];

      topics.forEach(topic => {
        expect(stdout).toContain(topic);
      });
    });

    it('should not revert to merge-only help', async () => {
      const { stdout } = await execAsync(`node ${wtPath} help`, {
        cwd: tempDir
      });

      // Should contain main worktree commands, not just merge-related topics
      expect(stdout).toContain('wt init');
      expect(stdout).toContain('wt create');
      expect(stdout).toContain('wt list');
      
      // Should have clear sections
      expect(stdout).toContain('Main Commands:');
      expect(stdout).toContain('Utility Commands:');
      expect(stdout).toContain('Troubleshooting Topics:');
      
      // Should not be dominated by merge topics
      const mainCommandsSection = stdout.split('Utility Commands:')[0];
      expect(mainCommandsSection).toContain('wt init');
      expect(mainCommandsSection).toContain('wt create');
    });

    it('should provide clear navigation instructions', async () => {
      const { stdout } = await execAsync(`node ${wtPath} help`, {
        cwd: tempDir
      });

      expect(stdout).toContain('Usage:');
      expect(stdout).toContain('wt <command> --help');
      expect(stdout).toContain('wt help <topic>');
      expect(stdout).toContain('Examples:');
      expect(stdout).toContain('Quick Start:');
    });

    it('should maintain consistent output format', async () => {
      const { stdout } = await execAsync(`node ${wtPath} help`, {
        cwd: tempDir
      });

      // Check for consistent section headers
      const sections = [
        'Git Worktree Tool (wt) - Help',
        'Main Commands:',
        'Utility Commands:', 
        'Troubleshooting Topics:',
        'Usage:',
        'Examples:',
        'Quick Start:'
      ];

      sections.forEach(section => {
        expect(stdout).toContain(section);
      });

      // Check that sections appear in the right order
      let lastIndex = -1;
      sections.forEach(section => {
        const currentIndex = stdout.indexOf(section);
        expect(currentIndex).toBeGreaterThan(lastIndex);
        lastIndex = currentIndex;
      });
    });
  });

  describe('error handling', () => {
    it('should not crash on malformed input', async () => {
      const testCases = [
        { cmd: 'help ""', expectError: false },  // Empty string shows topic list
        { cmd: 'help 123', expectError: false },   // Invalid topic shows error + topic list
        { cmd: 'help special-chars-!@#', expectError: false } // Invalid topic shows error + topic list
      ];

      for (const testCase of testCases) {
        try {
          const { stdout, stderr } = await execAsync(`node ${wtPath} ${testCase.cmd}`, {
            cwd: tempDir
          });

          // Should not crash - either show help or error gracefully
          expect(stderr).toBe('');
          expect(stdout.length).toBeGreaterThan(0);
        } catch (error) {
          // Commander.js throws errors for invalid flags, but that's expected
          if (testCase.cmd.includes('--invalid-flag')) {
            expect(error.message).toContain('unknown option');
          } else {
            throw error;
          }
        }
      }
      
      // Test invalid flag separately since it throws
      try {
        await execAsync(`node ${wtPath} help --invalid-flag`, {
          cwd: tempDir
        });
        throw new Error('Expected command to fail');
      } catch (error) {
        expect(error.message).toContain('unknown option');
      }
    });
  });
});