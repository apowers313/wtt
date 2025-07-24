const chalk = require('chalk');
const ProgressTracker = require('../../../lib/merge-helper/progress-tracker');
const { SectionProgressTracker } = require('../../../lib/merge-helper/progress-tracker');

describe('ProgressTracker', () => {
  let tracker;
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
      writable: true
    });
    
    tracker = new ProgressTracker(5);
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with correct values', () => {
      expect(tracker.total).toBe(5);
      expect(tracker.current).toBe(0);
      expect(tracker.files).toEqual([]);
      expect(tracker.startTime).toBeNull();
      expect(tracker.isCompleted).toBe(false);
    });
  });

  describe('start', () => {
    it('should set title and start time', () => {
      const now = Date.now();
      tracker.start('Processing files');
      
      expect(tracker.title).toBe('Processing files');
      expect(tracker.startTime).toBeGreaterThanOrEqual(now);
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('Processing files\n'));
    });

    it('should use default title when not provided', () => {
      tracker.start();
      
      expect(tracker.title).toBe('Progress');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('Progress\n'));
    });
  });

  describe('update', () => {
    beforeEach(() => {
      tracker.start('Test Progress');
    });

    it('should add new file to tracking', () => {
      tracker.update('file1.js', 'in_progress');
      
      expect(tracker.files).toHaveLength(1);
      expect(tracker.files[0]).toMatchObject({
        file: 'file1.js',
        status: 'in_progress'
      });
    });

    it('should update existing file status', () => {
      tracker.update('file1.js', 'in_progress');
      tracker.update('file1.js', 'completed');
      
      expect(tracker.files).toHaveLength(1);
      expect(tracker.files[0].status).toBe('completed');
    });

    it('should increment current count when status is completed', () => {
      tracker.update('file1.js', 'completed');
      tracker.update('file2.js', 'completed');
      
      expect(tracker.current).toBe(2);
    });

    it('should not increment current count for other statuses', () => {
      tracker.update('file1.js', 'in_progress');
      tracker.update('file2.js', 'error');
      
      expect(tracker.current).toBe(0);
    });
  });

  describe('complete', () => {
    it('should mark as completed and display duration', () => {
      tracker.start('Test Progress');
      
      // Mock time passage
      const startTime = Date.now() - 65000; // 1 minute 5 seconds ago
      tracker.startTime = startTime;
      
      tracker.complete();
      
      expect(tracker.isCompleted).toBe(true);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.green('\n✅ Test Progress completed in 1m 5s')
      );
    });
  });

  describe('render', () => {
    beforeEach(() => {
      tracker.start('Test Progress');
    });

    it('should render progress bar correctly', () => {
      tracker.current = 2;
      tracker.render();
      
      // Check for progress bar
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('40%')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.gray('2/5 files\n')
      );
    });

    it('should render in non-TTY environment', () => {
      mockProcessStdout.isTTY = false;
      
      // Clear previous calls
      mockStdoutWrite.mockClear();
      
      tracker.render();
      
      // Should not write escape sequences
      expect(mockStdoutWrite).not.toHaveBeenCalledWith('\x1B[2J\x1B[H');
    });
  });

  describe('renderFileList', () => {
    it('should render recent files with status icons', () => {
      tracker.files = [
        { file: 'file1.js', status: 'completed' },
        { file: 'file2.js', status: 'error' },
        { file: 'file3.js', status: 'in_progress' }
      ];
      
      tracker.renderFileList();
      
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.green('✅ file1.js'));
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.red('❌ file2.js'));
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.blue('🔄 file3.js'));
    });

    it('should show count when more than 10 files', () => {
      // Add 12 files
      for (let i = 1; i <= 12; i++) {
        tracker.files.push({ file: `file${i}.js`, status: 'completed' });
      }
      
      tracker.renderFileList();
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.gray('  ... and 2 more')
      );
    });
  });

  describe('getStatusIcon', () => {
    it('should return correct icons for each status', () => {
      expect(tracker.getStatusIcon('pending')).toBe('⏳');
      expect(tracker.getStatusIcon('in_progress')).toBe('🔄');
      expect(tracker.getStatusIcon('completed')).toBe('✅');
      expect(tracker.getStatusIcon('error')).toBe('❌');
      expect(tracker.getStatusIcon('skipped')).toBe('⏭️');
      expect(tracker.getStatusIcon('warning')).toBe('⚠️');
      expect(tracker.getStatusIcon('unknown')).toBe('❓');
    });
  });

  describe('getStatusColor', () => {
    it('should return correct color functions for each status', () => {
      expect(tracker.getStatusColor('pending')).toBe(chalk.gray);
      expect(tracker.getStatusColor('in_progress')).toBe(chalk.blue);
      expect(tracker.getStatusColor('completed')).toBe(chalk.green);
      expect(tracker.getStatusColor('error')).toBe(chalk.red);
      expect(tracker.getStatusColor('skipped')).toBe(chalk.yellow);
      expect(tracker.getStatusColor('warning')).toBe(chalk.yellow);
      expect(tracker.getStatusColor('unknown')).toBe(chalk.white);
    });
  });

  describe('addWarning', () => {
    it('should display warning message', () => {
      tracker.addWarning('This is a warning');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.yellow('\n⚠️  This is a warning')
      );
    });
  });

  describe('addError', () => {
    it('should display error message', () => {
      tracker.addError('This is an error');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.red('\n❌ This is an error')
      );
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      // Don't set tracker.current manually; let it be calculated from status
      tracker.files = [
        { file: 'file1.js', status: 'completed' },
        { file: 'file2.js', status: 'error' },
        { file: 'file3.js', status: 'in_progress' },
        { file: 'file4.js', status: 'pending' }
      ];
      
      const stats = tracker.getStats();
      
      // With 5 total and 4 files tracked, there should be 1 untracked (pending) file
      // Plus the 1 explicit pending file = 2 pending total
      expect(stats).toEqual({
        total: 5,
        completed: 1,
        pending: 2,
        in_progress: 1,
        error: 1,
        skipped: 0
      });
    });
  });

  describe('createSimple', () => {
    it('should create a simple progress bar', () => {
      const simpleProgress = ProgressTracker.createSimple(10);
      
      simpleProgress.update(3);
      expect(mockStdoutWrite).toHaveBeenCalledWith('\r[...       ] 30%');
      
      simpleProgress.update(7);
      expect(mockStdoutWrite).toHaveBeenCalledWith('\r[..........] 100%');
      expect(mockStdoutWrite).toHaveBeenCalledWith('\n');
    });

    it('should handle complete method', () => {
      const simpleProgress = ProgressTracker.createSimple(10);
      
      simpleProgress.complete();
      expect(mockStdoutWrite).toHaveBeenCalledWith('\n');
    });
  });
});

describe('SectionProgressTracker', () => {
  let sectionTracker;
  let mockConsoleLog;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    
    sectionTracker = new SectionProgressTracker(['Analysis', 'Processing', 'Cleanup']);
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize sections correctly', () => {
      expect(sectionTracker.sections).toHaveLength(3);
      expect(sectionTracker.sections[0]).toEqual({
        name: 'Analysis',
        status: 'pending',
        index: 1
      });
      expect(sectionTracker.currentSection).toBe(0);
    });
  });

  describe('startSection', () => {
    it('should mark section as in progress', () => {
      sectionTracker.startSection('Processing');
      
      const section = sectionTracker.sections.find(s => s.name === 'Processing');
      expect(section.status).toBe('in_progress');
      expect(sectionTracker.currentSection).toBe(2);
    });

    it('should handle non-existent section', () => {
      sectionTracker.startSection('NonExistent');
      
      // Should not throw error
      expect(sectionTracker.currentSection).toBe(0);
    });
  });

  describe('completeSection', () => {
    it('should mark section as completed', () => {
      sectionTracker.completeSection('Analysis');
      
      const section = sectionTracker.sections.find(s => s.name === 'Analysis');
      expect(section.status).toBe('completed');
    });
  });

  describe('render', () => {
    it('should render all sections with correct status', () => {
      sectionTracker.sections[0].status = 'completed';
      sectionTracker.sections[1].status = 'in_progress';
      
      sectionTracker.render();
      
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('\nProgress:\n'));
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.green('Step 1/3: Analysis ✅')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.blue('Step 2/3: Processing 🔄')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.gray('Step 3/3: Cleanup ⏳')
      );
    });
  });

  describe('getIcon', () => {
    it('should return correct icons', () => {
      expect(sectionTracker.getIcon('pending')).toBe('⏳');
      expect(sectionTracker.getIcon('in_progress')).toBe('🔄');
      expect(sectionTracker.getIcon('completed')).toBe('✅');
      expect(sectionTracker.getIcon('unknown')).toBe('');
    });
  });

  describe('getColor', () => {
    it('should return correct color functions', () => {
      expect(sectionTracker.getColor('pending')).toBe(chalk.gray);
      expect(sectionTracker.getColor('in_progress')).toBe(chalk.blue);
      expect(sectionTracker.getColor('completed')).toBe(chalk.green);
      expect(sectionTracker.getColor('unknown')).toBe(chalk.white);
    });
  });
});