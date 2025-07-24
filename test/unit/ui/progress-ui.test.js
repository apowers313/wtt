const chalk = require('chalk');
const ProgressUI = require('../../../lib/ui/progress-ui');
const ProgressTracker = require('../../../lib/merge-helper/progress-tracker');

jest.mock('../../../lib/merge-helper/progress-tracker');

describe('ProgressUI', () => {
  let mockConsoleLog;
  let mockStdoutWrite;
  let mockProcessStdout;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockStdoutWrite = jest.fn();
    mockProcessStdout = {
      isTTY: true,
      write: mockStdoutWrite
    };
    Object.defineProperty(process, 'stdout', {
      value: mockProcessStdout,
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
  });

  describe('displayMergeProgress', () => {
    it('should create section progress tracker for merge', () => {
      const mockTracker = { render: jest.fn() };
      ProgressTracker.SectionProgressTracker = jest.fn().mockReturnValue(mockTracker);
      
      const steps = ['Fetch', 'Merge', 'Cleanup'];
      const tracker = ProgressUI.displayMergeProgress('feature', 'main', steps);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.bold('Merge Progress: feature → main\n')
      );
      expect(ProgressTracker.SectionProgressTracker).toHaveBeenCalledWith(steps);
      expect(tracker).toBe(mockTracker);
    });
  });

  describe('displayConflictProgress', () => {
    it('should create progress tracker for conflicts', () => {
      const mockTracker = { start: jest.fn() };
      ProgressTracker.mockImplementation(() => mockTracker);
      
      const conflicts = [
        { file: 'file1.js', count: 3 },
        { file: 'file2.js', count: 2 }
      ];
      
      const tracker = ProgressUI.displayConflictProgress(conflicts);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.bold('Resolving 5 conflicts in 2 files\n')
      );
      expect(ProgressTracker).toHaveBeenCalledWith(2);
      expect(mockTracker.start).toHaveBeenCalledWith('Conflict Resolution');
      expect(tracker).toBe(mockTracker);
    });
  });

  describe('displayFileProgress', () => {
    it('should create progress tracker for file operations', () => {
      const mockTracker = { start: jest.fn() };
      ProgressTracker.mockImplementation(() => mockTracker);
      
      const files = ['file1.js', 'file2.js', 'file3.js'];
      const tracker = ProgressUI.displayFileProgress('Copying files', files);
      
      expect(ProgressTracker).toHaveBeenCalledWith(3);
      expect(mockTracker.start).toHaveBeenCalledWith('Copying files');
      expect(tracker).toBe(mockTracker);
    });
  });

  describe('createSpinner', () => {
    let mockSetInterval;
    let mockClearInterval;

    beforeEach(() => {
      mockSetInterval = jest.spyOn(global, 'setInterval').mockReturnValue(123);
      mockClearInterval = jest.spyOn(global, 'clearInterval');
    });

    afterEach(() => {
      mockSetInterval.mockRestore();
      mockClearInterval.mockRestore();
    });

    it('should create and start spinner', () => {
      const spinner = ProgressUI.createSpinner('Loading...');
      
      spinner.start();
      
      expect(mockStdoutWrite).toHaveBeenCalledWith('⠋ Loading...');
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 80);
    });

    it('should stop spinner with success message', () => {
      const spinner = ProgressUI.createSpinner('Loading...');
      spinner.start();
      
      spinner.stop('Done!');
      
      expect(mockClearInterval).toHaveBeenCalledWith(123);
      expect(mockStdoutWrite).toHaveBeenNthCalledWith(2, '\r✓ Done!\n');
    });

    it('should stop spinner with default message', () => {
      const spinner = ProgressUI.createSpinner('Loading...');
      spinner.start();
      
      spinner.stop();
      
      expect(mockStdoutWrite).toHaveBeenNthCalledWith(2, '\r✓ Loading...\n');
    });

    it('should fail spinner with error message', () => {
      const spinner = ProgressUI.createSpinner('Loading...');
      spinner.start();
      
      spinner.fail('Failed!');
      
      expect(mockClearInterval).toHaveBeenCalledWith(123);
      expect(mockStdoutWrite).toHaveBeenNthCalledWith(2, '\r✗ Failed!\n');
    });
  });

  describe('displaySummary', () => {
    it('should display complete summary stats', () => {
      const stats = {
        total: 10,
        completed: 7,
        skipped: 1,
        error: 1,
        warning: 1
      };
      
      ProgressUI.displaySummary(stats);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('\nSummary:\n'));
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.green('✅ Completed: 7'));
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.yellow('⏭️  Skipped: 1'));
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.red('❌ Errors: 1'));
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.yellow('⚠️  Warnings: 1'));
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.gray('\nSuccess rate: 70%'));
    });

    it('should only display non-zero stats', () => {
      const stats = {
        total: 5,
        completed: 5,
        skipped: 0,
        error: 0,
        warning: 0
      };
      
      ProgressUI.displaySummary(stats);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.green('✅ Completed: 5'));
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Skipped'));
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Errors'));
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.gray('\nSuccess rate: 100%'));
    });
  });

  describe('displayConflictStats', () => {
    it('should display conflict statistics', () => {
      const stats = {
        totalFiles: 3,
        totalConflicts: 8,
        byType: {
          'modify/modify': 5,
          'delete/modify': 3
        },
        bySize: {
          small: 2,
          medium: 4,
          large: 2
        }
      };
      
      ProgressUI.displayConflictStats(stats);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('Conflict Summary:\n'));
      expect(mockConsoleLog).toHaveBeenCalledWith('Total files with conflicts: 3');
      expect(mockConsoleLog).toHaveBeenCalledWith('Total conflicts: 8\n');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('By type:'));
      expect(mockConsoleLog).toHaveBeenCalledWith('  modify/modify: 5');
      expect(mockConsoleLog).toHaveBeenCalledWith('  delete/modify: 3');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('\nBy size:'));
      expect(mockConsoleLog).toHaveBeenCalledWith('  Small (< 10 lines): 2');
      expect(mockConsoleLog).toHaveBeenCalledWith('  Medium (10-50 lines): 4');
      expect(mockConsoleLog).toHaveBeenCalledWith('  Large (> 50 lines): 2');
    });

    it('should handle empty byType and bySize', () => {
      const stats = {
        totalFiles: 0,
        totalConflicts: 0,
        byType: {},
        bySize: {}
      };
      
      ProgressUI.displayConflictStats(stats);
      
      expect(mockConsoleLog).toHaveBeenCalledWith('Total files with conflicts: 0');
      expect(mockConsoleLog).toHaveBeenCalledWith('Total conflicts: 0\n');
      expect(mockConsoleLog).not.toHaveBeenCalledWith(chalk.bold('By type:'));
      expect(mockConsoleLog).not.toHaveBeenCalledWith(chalk.bold('\nBy size:'));
    });
  });

  describe('showMergeOptions', () => {
    it('should display merge strategy options', () => {
      const branch = 'feature-branch';
      const hasConflicts = true;
      
      ProgressUI.showMergeOptions(branch, hasConflicts);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.bold('\nMerge Options for feature-branch:\n')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.yellow('⚠️  This branch has conflicts that need resolution\n')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Regular merge')
      );
    });

    it('should not show conflict warning when no conflicts', () => {
      const branch = 'feature-branch';
      const hasConflicts = false;
      
      ProgressUI.showMergeOptions(branch, hasConflicts);
      
      expect(mockConsoleLog).not.toHaveBeenCalledWith(
        expect.stringContaining('conflicts that need resolution')
      );
    });
  });

  describe('createMultiProgress', () => {
    it('should create multi-task progress tracker', () => {
      const tasks = [
        { name: 'Task 1', total: 10, current: 0 },
        { name: 'Task 2', total: 5, current: 0 }
      ];
      
      const progress = ProgressUI.createMultiProgress('Multi-task Operation', tasks);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.bold('Multi-task Operation\n')
      );
      expect(progress.tasks).toBe(tasks);
      expect(progress.update).toBeDefined();
      expect(progress.render).toBeDefined();
    });

    it('should update task progress', () => {
      const tasks = [
        { name: 'Task 1', total: 10, current: 0, status: 'pending' }
      ];
      
      const progress = ProgressUI.createMultiProgress('Multi-task Operation', tasks);
      
      progress.update('Task 1', 5);
      
      expect(tasks[0].current).toBe(5);
      expect(tasks[0].status).toBe('in_progress');
    });

    it('should mark task as completed when reaching total', () => {
      const tasks = [
        { name: 'Task 1', total: 10, current: 0, status: 'pending' }
      ];
      
      const progress = ProgressUI.createMultiProgress('Multi-task Operation', tasks);
      
      progress.update('Task 1', 10);
      
      expect(tasks[0].current).toBe(10);
      expect(tasks[0].status).toBe('completed');
    });
  });

  describe('createTreeProgress', () => {
    it('should create tree progress tracker', () => {
      const tree = [
        {
          name: 'Root',
          status: 'pending',
          children: [
            { name: 'Child 1', status: 'pending' },
            { name: 'Child 2', status: 'pending' }
          ]
        }
      ];
      
      const treeProgress = ProgressUI.createTreeProgress('Tree Operation', tree);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('Tree Operation\n'));
      expect(treeProgress.nodes).toBe(tree);
      expect(treeProgress.updateNode).toBeDefined();
    });

    it('should update node status', () => {
      const tree = [
        {
          name: 'Root',
          status: 'pending',
          children: [
            { name: 'Child 1', status: 'pending' },
            { name: 'Child 2', status: 'pending' }
          ]
        }
      ];
      
      const treeProgress = ProgressUI.createTreeProgress('Tree Operation', tree);
      
      treeProgress.updateNode('Root/Child 1', 'completed');
      
      expect(tree[0].children[0].status).toBe('completed');
    });

    it('should render tree with correct icons', () => {
      const tree = [
        { name: 'Pending', status: 'pending' },
        { name: 'InProgress', status: 'in_progress' },
        { name: 'Completed', status: 'completed' },
        { name: 'Error', status: 'error' },
        { name: 'Skipped', status: 'skipped' }
      ];
      
      const treeProgress = ProgressUI.createTreeProgress('Tree Operation', tree);
      
      // Reset mock to check render output
      mockConsoleLog.mockClear();
      treeProgress.renderNode(tree, '', true);
      
      expect(mockConsoleLog).toHaveBeenCalledWith('├─ ⏳ Pending');
      expect(mockConsoleLog).toHaveBeenCalledWith('├─ 🔄 InProgress');
      expect(mockConsoleLog).toHaveBeenCalledWith('├─ ✅ Completed');
      expect(mockConsoleLog).toHaveBeenCalledWith('├─ ❌ Error');
      expect(mockConsoleLog).toHaveBeenCalledWith('└─ ⏭️ Skipped');
    });
  });
});