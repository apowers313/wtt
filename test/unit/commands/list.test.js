const { listCommand } = require('../../../commands/list');
const path = require('path');
const originalBasename = path.basename;

// Mock the dependencies
jest.mock('../../../lib/config');
jest.mock('../../../lib/portManager');
jest.mock('../../../lib/gitOps');
jest.mock('chalk', () => ({
  red: jest.fn(msg => msg),
  green: jest.fn(msg => msg),
  yellow: jest.fn(msg => msg)
}));

const config = require('../../../lib/config');
const portManager = require('../../../lib/portManager');
const gitOps = require('../../../lib/gitOps');

describe('list command', () => {
  let mockConsoleLog;
  let mockConsoleError;
  let mockProcessExit;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

    // Default mocks
    gitOps.validateRepository = jest.fn().mockResolvedValue();
    config.load = jest.fn().mockResolvedValue();
    config.get = jest.fn().mockReturnValue({
      portRanges: {
        vite: { start: 3000, increment: 10 },
        storybook: { start: 6006, increment: 10 }
      }
    });
    config.getBaseDir = jest.fn().mockReturnValue('/test/repo');
    portManager.init = jest.fn().mockResolvedValue();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
  });

  test('displays message when no worktrees found', async () => {
    gitOps.listWorktrees = jest.fn().mockResolvedValue([]);

    await listCommand({});

    expect(mockConsoleLog).toHaveBeenCalledWith('No worktrees found.');
    expect(mockProcessExit).not.toHaveBeenCalled();
  });

  test('lists worktrees with basic information', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature-1'),
        branch: 'feature-1'
      },
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature-2'),
        branch: 'feature-2'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    portManager.getPorts = jest.fn()
      .mockReturnValueOnce({ vite: 3000, storybook: 6006 })
      .mockReturnValueOnce({ vite: 3010, storybook: 6016 });
    portManager.formatPortDisplay = jest.fn()
      .mockReturnValueOnce('vite:3000 storybook:6006')
      .mockReturnValueOnce('vite:3010 storybook:6016');

    await listCommand({});

    expect(mockConsoleLog).toHaveBeenCalledWith('\nWorktrees:');
    expect(mockConsoleLog).toHaveBeenCalledWith('  wt-feature-1 (feature-1) - vite:3000 storybook:6006');
    expect(mockConsoleLog).toHaveBeenCalledWith('  wt-feature-2 (feature-2) - vite:3010 storybook:6016');
    expect(mockConsoleLog).toHaveBeenCalledWith('\nUse --verbose for detailed information');
  });

  test('lists worktrees with verbose information', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature-test'),
        branch: 'feature-test'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.getWorktreeInfo = jest.fn().mockResolvedValue({
      branch: 'feature-test',
      ahead: 2,
      behind: 0,
      modified: 3,
      uncommitted: true
    });
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.getRunningPorts = jest.fn().mockResolvedValue({ vite: 3000 });
    portManager.isPortInUse = jest.fn().mockResolvedValue(true);

    await listCommand({ verbose: true });

    expect(mockConsoleLog).toHaveBeenCalledWith('\nWORKTREE           BRANCH         PORTS              STATUS');
    expect(mockConsoleLog).toHaveBeenCalledWith('─'.repeat(70));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('wt-feature-test'));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('feature-test'));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('vite:3000'));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('2 commits ahead'));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('3 files modified'));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Uncommitted changes'));
  });

  test('handles worktrees without port assignments', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-no-ports'),
        branch: 'no-ports'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    portManager.getPorts = jest.fn().mockReturnValue(null);
    portManager.formatPortDisplay = jest.fn();

    await listCommand({});

    expect(mockConsoleLog).toHaveBeenCalledWith('  wt-no-ports (no-ports) - No ports');
  });

  test('filters out non-managed worktrees', async () => {
    const mockWorktrees = [
      { 
        path: '/some/other/path/feature-1',
        branch: 'feature-1'
      },
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-feature-2'),
        branch: 'feature-2'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.formatPortDisplay = jest.fn().mockReturnValue('vite:3000');

    await listCommand({});

    expect(mockConsoleLog).toHaveBeenCalledWith('\nWorktrees:');
    expect(mockConsoleLog).toHaveBeenCalledWith('  wt-feature-2 (feature-2) - vite:3000');
    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('feature-1'));
  });

  test('handles error when worktree info cannot be retrieved', async () => {
    const mockWorktrees = [
      { 
        path: path.join('/test/repo', '.worktrees', 'wt-broken'),
        branch: 'broken'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    gitOps.getWorktreeInfo = jest.fn().mockRejectedValue(new Error('Worktree not found'));
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.getRunningPorts = jest.fn().mockResolvedValue({});

    await listCommand({ verbose: true });

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('wt-broken'));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('broken'));
  });

  test('handles Windows paths correctly', async () => {
    // Mock path.basename to handle Windows paths
    path.basename = jest.fn().mockImplementation((p) => {
      // Extract the last part of the path
      const parts = p.split(/[\\/]/);
      return parts[parts.length - 1];
    });

    const mockWorktrees = [
      { 
        path: 'C:\\test\\repo\\.worktrees\\wt-feature',
        branch: 'feature'
      }
    ];

    gitOps.listWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.formatPortDisplay = jest.fn().mockReturnValue('vite:3000');

    await listCommand({});

    expect(mockConsoleLog).toHaveBeenCalledWith('  wt-feature (feature) - vite:3000');
    
    // Restore original basename
    path.basename = originalBasename;
  });

  test('handles error and exits with code 1', async () => {
    const error = new Error('Repository validation failed');
    gitOps.validateRepository = jest.fn().mockRejectedValue(error);

    await listCommand({});

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Repository validation failed');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });
});