const { portsCommand } = require('../../../commands/ports');

// Mock the dependencies
jest.mock('../../../lib/config');
jest.mock('../../../lib/portManager');
jest.mock('../../../lib/gitOps');
jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));
jest.mock('chalk', () => ({
  red: jest.fn(msg => msg),
  green: jest.fn(msg => msg),
  yellow: jest.fn(msg => msg)
}));

const config = require('../../../lib/config');
const portManager = require('../../../lib/portManager');
const gitOps = require('../../../lib/gitOps');
const inquirer = require('inquirer');

describe('ports command', () => {
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
        storybook: { start: 6006, increment: 10 },
        custom: { start: 8000, increment: 10 }
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

  test('shows ports for specific worktree', async () => {
    const mockPorts = {
      vite: 3000,
      storybook: 6006,
      custom: 8000
    };

    portManager.getPorts = jest.fn().mockReturnValue(mockPorts);
    portManager.isPortInUse = jest.fn()
      .mockResolvedValueOnce(true)  // vite in use
      .mockResolvedValueOnce(false) // storybook not in use
      .mockResolvedValueOnce(false); // custom not in use

    await portsCommand('wt-feature');

    expect(mockConsoleLog).toHaveBeenCalledWith('\nPorts for worktree \'wt-feature\':');
    expect(mockConsoleLog).toHaveBeenCalledWith('  vite: 3000 (in use)');
    expect(mockConsoleLog).toHaveBeenCalledWith('  storybook: 6006 (available)');
    expect(mockConsoleLog).toHaveBeenCalledWith('  custom: 8000 (available)');
  });

  test('shows message when worktree has no ports', async () => {
    portManager.getPorts = jest.fn().mockReturnValue(null);

    await portsCommand('wt-nonexistent');

    expect(mockConsoleLog).toHaveBeenCalledWith('No ports assigned to worktree \'wt-nonexistent\'');
    expect(mockProcessExit).not.toHaveBeenCalled();
  });

  test('shows all port assignments when no worktree specified', async () => {
    const mockAllPorts = {
      'wt-feature-1': {
        vite: 3000,
        storybook: 6006
      },
      'wt-feature-2': {
        vite: 3010,
        storybook: 6016
      }
    };

    portManager.getAllPorts = jest.fn().mockReturnValue(mockAllPorts);
    portManager.getAllUsedPorts = jest.fn().mockReturnValue([3000, 6006, 3010, 6016]);
    portManager.isPortInUse = jest.fn().mockResolvedValue(false);

    await portsCommand();

    expect(mockConsoleLog).toHaveBeenCalledWith('\nPort assignments for all worktrees:');
    expect(mockConsoleLog).toHaveBeenCalledWith('─'.repeat(50));
    expect(mockConsoleLog).toHaveBeenCalledWith('\nwt-feature-1');
    expect(mockConsoleLog).toHaveBeenCalledWith('  vite: 3000');
    expect(mockConsoleLog).toHaveBeenCalledWith('  storybook: 6006');
    expect(mockConsoleLog).toHaveBeenCalledWith('\nwt-feature-2');
    expect(mockConsoleLog).toHaveBeenCalledWith('  vite: 3010');
    expect(mockConsoleLog).toHaveBeenCalledWith('  storybook: 6016');
    expect(mockConsoleLog).toHaveBeenCalledWith('\nTotal ports in use: 4');
  });

  test('shows message when no port assignments found', async () => {
    portManager.getAllPorts = jest.fn().mockReturnValue({});

    await portsCommand();

    expect(mockConsoleLog).toHaveBeenCalledWith('No port assignments found');
  });

  test('detects and handles port conflicts', async () => {
    const mockPorts = {
      vite: 3000,
      storybook: 6006
    };

    portManager.getPorts = jest.fn().mockReturnValue(mockPorts);
    portManager.isPortInUse = jest.fn()
      .mockResolvedValueOnce(true)  // vite in use (first check)
      .mockResolvedValueOnce(false) // storybook not in use (first check)
      .mockResolvedValueOnce(true); // vite in use (conflict check)
    portManager.getRunningPorts = jest.fn().mockResolvedValue({}); // No ports from this worktree
    portManager.getAllUsedPorts = jest.fn().mockReturnValue([3000]);
    portManager.findAvailablePort = jest.fn().mockReturnValue(3010);
    portManager.portMap = { 'wt-feature': { ...mockPorts, created: '2025-01-01' } };
    portManager.save = jest.fn().mockResolvedValue();
    
    inquirer.prompt = jest.fn().mockResolvedValue({ reassign: true });

    await portsCommand('wt-feature');

    expect(mockConsoleLog).toHaveBeenCalledWith('\n⚠ Port conflicts detected:');
    expect(mockConsoleLog).toHaveBeenCalledWith('  vite port 3000 is in use by another process');
    expect(inquirer.prompt).toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalledWith('✓ Reassigned vite to port 3010');
    expect(portManager.save).toHaveBeenCalled();
  });

  test('handles port checking errors gracefully', async () => {
    const mockPorts = {
      vite: 3000
    };

    portManager.getPorts = jest.fn().mockReturnValue(mockPorts);
    portManager.isPortInUse = jest.fn().mockRejectedValue(new Error('Permission denied'));

    await portsCommand('wt-feature');

    // Should still display ports even if checking fails
    expect(mockConsoleLog).toHaveBeenCalledWith('\nPorts for worktree \'wt-feature\':');
    expect(mockConsoleLog).toHaveBeenCalledWith('  vite: 3000');
  });

  test('displays port ranges', async () => {
    portManager.getAllPorts = jest.fn().mockReturnValue({
      'wt-test': { vite: 3000 }
    });
    portManager.getAllUsedPorts = jest.fn().mockReturnValue([3000]);
    portManager.isPortInUse = jest.fn().mockResolvedValue(false);

    await portsCommand();

    expect(mockConsoleLog).toHaveBeenCalledWith('\nPort ranges:');
    expect(mockConsoleLog).toHaveBeenCalledWith('  vite: 3000-3100 (increment: 10)');
    expect(mockConsoleLog).toHaveBeenCalledWith('  storybook: 6006-6106 (increment: 10)');
    expect(mockConsoleLog).toHaveBeenCalledWith('  custom: 8000-8100 (increment: 10)');
  });

  test('handles missing port ranges configuration', async () => {
    config.get = jest.fn().mockReturnValue({});
    portManager.getAllPorts = jest.fn().mockReturnValue({});

    await portsCommand();

    expect(mockConsoleLog).toHaveBeenCalledWith('No port assignments found');
    // Should not crash when portRanges is undefined
    expect(mockProcessExit).not.toHaveBeenCalled();
  });

  test('handles error and exits with code 1', async () => {
    const error = new Error('Repository validation failed');
    gitOps.validateRepository = jest.fn().mockRejectedValue(error);

    await portsCommand();

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Repository validation failed');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('shows port status with check mark for in-use ports', async () => {
    const mockAllPorts = {
      'wt-active': {
        vite: 3000
      }
    };

    portManager.getAllPorts = jest.fn().mockReturnValue(mockAllPorts);
    portManager.getAllUsedPorts = jest.fn().mockReturnValue([3000]);
    portManager.isPortInUse = jest.fn().mockResolvedValue(true);

    await portsCommand();

    expect(mockConsoleLog).toHaveBeenCalledWith('  vite: 3000 ✓');
  });
});