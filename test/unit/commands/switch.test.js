const { switchCommand } = require('../../../commands/switch');
const path = require('path');
const fs = require('fs').promises;

// Mock the dependencies
jest.mock('../../../lib/config');
jest.mock('../../../lib/portManager');
jest.mock('../../../lib/gitOps');
jest.mock('fs').promises;
jest.mock('chalk', () => ({
  red: jest.fn(msg => msg),
  green: jest.fn(msg => msg),
  blue: jest.fn(msg => msg),
  cyan: jest.fn(msg => msg),
  gray: jest.fn(msg => msg),
  yellow: jest.fn(msg => msg)
}));

const config = require('../../../lib/config');
const portManager = require('../../../lib/portManager');
const gitOps = require('../../../lib/gitOps');

describe('switch command', () => {
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
    config.get = jest.fn().mockReturnValue({});
    config.getBaseDir = jest.fn().mockReturnValue('/test/repo');
    config.getWorktreePath = jest.fn((name) => path.join('/test/repo', '.worktrees', name));
    portManager.init = jest.fn().mockResolvedValue();
    fs.access = jest.fn().mockResolvedValue();
    fs.readFile = jest.fn();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
  });

  test('successfully switches to a worktree', async () => {
    const worktreePath = path.join('/test/repo', '.worktrees', 'wt-feature');
    const mockPorts = {
      vite: 3000,
      storybook: 6006
    };

    portManager.getPorts = jest.fn().mockReturnValue(mockPorts);
    portManager.isPortInUse = jest.fn()
      .mockResolvedValueOnce(true)  // vite running
      .mockResolvedValueOnce(false); // storybook not running
    
    const mockPackageJson = {
      scripts: {
        dev: 'vite',
        storybook: 'storybook dev',
        test: 'jest'
      }
    };
    fs.readFile = jest.fn().mockResolvedValue(JSON.stringify(mockPackageJson));

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleLog).toHaveBeenCalledWith('Switching to worktree \'wt-feature\'...');
    expect(mockConsoleLog).toHaveBeenCalledWith(`Path: ${worktreePath}`);
    expect(mockConsoleLog).toHaveBeenCalledWith('\n' + 'Assigned ports:');
    expect(mockConsoleLog).toHaveBeenCalledWith('  vite: 3000 (running)');
    expect(mockConsoleLog).toHaveBeenCalledWith('  storybook: 6006');
    expect(mockConsoleLog).toHaveBeenCalledWith('\n' + 'Available npm scripts:');
    expect(mockConsoleLog).toHaveBeenCalledWith('  npm run dev');
    expect(mockConsoleLog).toHaveBeenCalledWith('  npm run storybook');
    expect(mockConsoleLog).toHaveBeenCalledWith('  npm run test');
    expect(mockConsoleLog).toHaveBeenCalledWith('\n' + 'To navigate to this worktree:');
    expect(mockConsoleLog).toHaveBeenCalledWith(`  cd ${worktreePath}`);
  });

  test('handles non-existent worktree', async () => {
    fs.access = jest.fn().mockRejectedValue(new Error('Not found'));

    await switchCommand('wt-nonexistent', { shell: false });

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Worktree \'wt-nonexistent\' doesn\'t exist. Use \'wt list\' to see available worktrees, or \'wt create wt-nonexistent\' to create it');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('handles worktree without ports', async () => {
    portManager.getPorts = jest.fn().mockReturnValue(null);
    fs.readFile = jest.fn().mockRejectedValue(new Error('No package.json'));

    await switchCommand('wt-no-ports', { shell: false });

    expect(mockConsoleLog).toHaveBeenCalledWith('Switching to worktree \'wt-no-ports\'...');
    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Assigned ports:'));
    expect(mockConsoleLog).toHaveBeenCalledWith('\n' + 'To navigate to this worktree:');
  });

  test('handles missing package.json gracefully', async () => {
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.isPortInUse = jest.fn().mockResolvedValue(false);
    fs.readFile = jest.fn().mockRejectedValue(new Error('ENOENT'));

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleLog).toHaveBeenCalledWith('Switching to worktree \'wt-feature\'...');
    expect(mockConsoleLog).toHaveBeenCalledWith('\n' + 'Assigned ports:');
    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Available npm scripts:'));
  });

  test('handles invalid package.json gracefully', async () => {
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.isPortInUse = jest.fn().mockResolvedValue(false);
    fs.readFile = jest.fn().mockResolvedValue('invalid json');

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleLog).toHaveBeenCalledWith('Switching to worktree \'wt-feature\'...');
    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Available npm scripts:'));
  });

  test('shows note about changing directory when SHELL is set', async () => {
    process.env.SHELL = '/bin/bash';
    portManager.getPorts = jest.fn().mockReturnValue(null);
    fs.readFile = jest.fn().mockRejectedValue(new Error('No package.json'));

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleLog).toHaveBeenCalledWith('\n' + 'Note: This command cannot change your current directory.');
    expect(mockConsoleLog).toHaveBeenCalledWith('You need to manually run the cd command shown above.');

    delete process.env.SHELL;
  });

  test('handles Windows paths correctly', async () => {
    const worktreePath = 'C:\\test\\repo\\.worktrees\\wt-feature';
    config.getWorktreePath = jest.fn().mockReturnValue(worktreePath);
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.isPortInUse = jest.fn().mockResolvedValue(false);
    fs.readFile = jest.fn().mockRejectedValue(new Error('No package.json'));

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleLog).toHaveBeenCalledWith(`Path: ${worktreePath}`);
    expect(mockConsoleLog).toHaveBeenCalledWith(`  cd ${worktreePath}`);
  });

  test('displays all port statuses', async () => {
    const mockPorts = {
      vite: 3000,
      storybook: 6006,
      custom: 8000
    };

    portManager.getPorts = jest.fn().mockReturnValue(mockPorts);
    portManager.isPortInUse = jest.fn()
      .mockResolvedValueOnce(true)   // vite running
      .mockResolvedValueOnce(false)  // storybook not running
      .mockResolvedValueOnce(true);  // custom running
    fs.readFile = jest.fn().mockRejectedValue(new Error('No package.json'));

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleLog).toHaveBeenCalledWith('  vite: 3000 (running)');
    expect(mockConsoleLog).toHaveBeenCalledWith('  storybook: 6006');
    expect(mockConsoleLog).toHaveBeenCalledWith('  custom: 8000 (running)');
  });

  test('handles error and exits with code 1', async () => {
    const error = new Error('Repository validation failed');
    gitOps.validateRepository = jest.fn().mockRejectedValue(error);

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Repository validation failed');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('handles package.json without scripts section', async () => {
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.isPortInUse = jest.fn().mockResolvedValue(false);
    
    const mockPackageJson = {
      name: 'test-package',
      version: '1.0.0'
      // No scripts section
    };
    fs.readFile = jest.fn().mockResolvedValue(JSON.stringify(mockPackageJson));

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Available npm scripts:'));
  });
});