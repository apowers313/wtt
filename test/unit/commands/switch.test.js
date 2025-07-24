const { switchCommand } = require('../../../commands/switch');
const path = require('path');
const os = require('os');

// Mock the dependencies
jest.mock('../../../lib/config');
jest.mock('../../../lib/portManager');
jest.mock('../../../lib/gitOps');
jest.mock('../../../lib/promptBuilder');
jest.mock('../../../lib/currentWorktree');
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  promises: {
    access: jest.fn(),
    readFile: jest.fn()
  }
}));
jest.mock('child_process');
jest.mock('os');
jest.mock('inquirer');
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
const PromptBuilder = require('../../../lib/promptBuilder');
const { spawn } = require('child_process');
const fs = require('fs');
const inquirer = require('inquirer');
const { getCurrentWorktree } = require('../../../lib/currentWorktree');

describe('switch command', () => {
  let mockConsoleLog;
  let mockConsoleError;
  let mockProcessExit;
  let mockChildProcess;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

    // Mock child process
    mockChildProcess = {
      on: jest.fn(),
      kill: jest.fn(),
      killed: false,
      stdin: { write: jest.fn() },
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() }
    };
    spawn.mockReturnValue(mockChildProcess);

    // Default mocks
    gitOps.validateRepository = jest.fn().mockResolvedValue();
    config.load = jest.fn().mockResolvedValue();
    config.get = jest.fn().mockReturnValue({});
    config.getBaseDir = jest.fn().mockReturnValue('/test/repo');
    config.getWorktreePath = jest.fn((name) => path.join('/test/repo', '.worktrees', name));
    portManager.init = jest.fn().mockResolvedValue();
    fs.promises.access.mockResolvedValue();
    fs.promises.readFile.mockResolvedValue('{}');
    fs.writeFileSync.mockReturnValue();
    fs.unlinkSync.mockReturnValue();
    os.platform.mockReturnValue('linux');
    os.tmpdir.mockReturnValue('/tmp');
    
    // Mock PromptBuilder
    PromptBuilder.mockImplementation(() => ({
      buildPrompt: jest.fn((template) => template.replace('{worktree}', 'wt-feature'))
    }));
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
    fs.promises.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

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
    fs.promises.access.mockRejectedValue(new Error('Not found'));

    await switchCommand('wt-nonexistent', { shell: false });

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Worktree \'wt-nonexistent\' doesn\'t exist. Use \'wt list\' to see available worktrees, or \'wt create wt-nonexistent\' to create it');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('handles worktree without ports', async () => {
    portManager.getPorts = jest.fn().mockReturnValue(null);
    fs.promises.readFile.mockRejectedValue(new Error('No package.json'));

    await switchCommand('wt-no-ports', { shell: false });

    expect(mockConsoleLog).toHaveBeenCalledWith('Switching to worktree \'wt-no-ports\'...');
    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Assigned ports:'));
    expect(mockConsoleLog).toHaveBeenCalledWith('\n' + 'To navigate to this worktree:');
  });

  test('handles missing package.json gracefully', async () => {
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.isPortInUse = jest.fn().mockResolvedValue(false);
    fs.promises.readFile.mockRejectedValue(new Error('ENOENT'));

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleLog).toHaveBeenCalledWith('Switching to worktree \'wt-feature\'...');
    expect(mockConsoleLog).toHaveBeenCalledWith('\n' + 'Assigned ports:');
    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Available npm scripts:'));
  });

  test('handles invalid package.json gracefully', async () => {
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.isPortInUse = jest.fn().mockResolvedValue(false);
    fs.promises.readFile.mockResolvedValue('invalid json');

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleLog).toHaveBeenCalledWith('Switching to worktree \'wt-feature\'...');
    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Available npm scripts:'));
  });

  test('shows note about changing directory when SHELL is set', async () => {
    process.env.SHELL = '/bin/bash';
    portManager.getPorts = jest.fn().mockReturnValue(null);
    fs.promises.readFile.mockRejectedValue(new Error('No package.json'));

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
    fs.promises.readFile.mockRejectedValue(new Error('No package.json'));

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleLog).toHaveBeenCalledWith(`Path: ${worktreePath}`);
    expect(mockConsoleLog).toHaveBeenCalledWith(`  cd ${worktreePath}`);
  });

  test('shows interactive worktree list when no argument provided', async () => {
    const mockWorktrees = [
      { name: 'feature-auth', branch: 'feature/auth-system', isMainWorktree: false },
      { name: 'bugfix-123', branch: 'bugfix/issue-123', isMainWorktree: false },
      { name: 'main', branch: 'main', isMainWorktree: true }
    ];
    
    gitOps.getWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    getCurrentWorktree.mockResolvedValue(null); // Not in a worktree
    inquirer.prompt = jest.fn().mockResolvedValue({ selectedWorktree: 'feature-auth' });
    
    portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
    portManager.isPortInUse = jest.fn().mockResolvedValue(false);
    fs.promises.readFile.mockRejectedValue(new Error('No package.json'));

    await switchCommand(null, { shell: false });

    expect(gitOps.getWorktrees).toHaveBeenCalled();
    expect(inquirer.prompt).toHaveBeenCalledWith([{
      type: 'list',
      name: 'selectedWorktree',
      message: 'Select worktree to switch to:',
      choices: [
        { name: 'feature-auth - feature/auth-system', value: 'feature-auth' },
        { name: 'bugfix-123 - bugfix/issue-123', value: 'bugfix-123' }
      ]
    }]);
    expect(mockConsoleLog).toHaveBeenCalledWith('Switching to worktree \'feature-auth\'...');
  });

  test('shows current worktree marked in list', async () => {
    const mockWorktrees = [
      { name: 'feature-auth', branch: 'feature/auth-system', isMainWorktree: false },
      { name: 'bugfix-123', branch: 'bugfix/issue-123', isMainWorktree: false }
    ];
    
    gitOps.getWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    getCurrentWorktree.mockResolvedValue('feature-auth'); // Currently in feature-auth
    inquirer.prompt = jest.fn().mockResolvedValue({ selectedWorktree: 'bugfix-123' });
    
    portManager.getPorts = jest.fn().mockReturnValue(null);
    fs.promises.readFile.mockRejectedValue(new Error('No package.json'));

    await switchCommand(null, { shell: false });

    expect(inquirer.prompt).toHaveBeenCalledWith([{
      type: 'list',
      name: 'selectedWorktree',
      message: 'Select worktree to switch to:',
      choices: [
        { name: 'feature-auth (current) - feature/auth-system', value: 'feature-auth' },
        { name: 'bugfix-123 - bugfix/issue-123', value: 'bugfix-123' }
      ]
    }]);
  });

  test('throws error when no worktrees found', async () => {
    gitOps.getWorktrees = jest.fn().mockResolvedValue([]);
    
    await switchCommand(null, { shell: false });

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'No worktrees found. Use \'wt create <branch>\' to create one.');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('throws error when only main worktree exists', async () => {
    const mockWorktrees = [
      { name: 'main', branch: 'main', isMainWorktree: true }
    ];
    
    gitOps.getWorktrees = jest.fn().mockResolvedValue(mockWorktrees);
    getCurrentWorktree.mockResolvedValue(null);
    
    await switchCommand(null, { shell: false });

    expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'No worktrees available to switch to.');
    expect(mockProcessExit).toHaveBeenCalledWith(1);
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
    fs.promises.readFile.mockRejectedValue(new Error('No package.json'));

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
    fs.promises.readFile.mockResolvedValue(JSON.stringify(mockPackageJson));

    await switchCommand('wt-feature', { shell: false });

    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('Available npm scripts:'));
  });

  describe('shell spawning', () => {
    beforeEach(() => {
      // Reset mock child process for each test
      mockChildProcess.on.mockReset();
      mockChildProcess.on.mockReturnValue(mockChildProcess);
      // Ensure spawn is properly mocked
      spawn.mockReturnValue(mockChildProcess);
    });

    test('spawns shell when shell option is true', async () => {
      process.env.SHELL = '/bin/bash';
      portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
      portManager.isPortInUse = jest.fn().mockResolvedValue(false);
      fs.promises.access.mockResolvedValue(); // Ensure worktree path exists
      fs.promises.readFile.mockRejectedValue(new Error('No package.json'));

      // Setup the mock to immediately call the exit callback
      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          // Call the callback synchronously
          callback(0);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });
      
      expect(spawn).toHaveBeenCalledWith(
        '/bin/bash',
        expect.any(Array),
        expect.objectContaining({
          cwd: expect.stringContaining('.worktrees/wt-feature'),
          env: expect.objectContaining({
            WT_WORKTREE: 'wt-feature',
            WT_WORKTREE_PATH: expect.stringContaining('.worktrees/wt-feature')
          }),
          stdio: 'inherit',
          shell: false
        })
      );
    });

    test('spawns shell with default behavior when no shell option provided', async () => {
      process.env.SHELL = '/bin/bash';
      portManager.getPorts = jest.fn().mockReturnValue(null);
      fs.promises.readFile.mockRejectedValue(new Error('No package.json'));

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature'); // No options = default behavior

      expect(mockConsoleLog).toHaveBeenCalledWith('\n' + 'Spawning shell in worktree directory...');
      expect(spawn).toHaveBeenCalled();
    });

    test('handles bash shell with custom prompt', async () => {
      process.env.SHELL = '/bin/bash';
      config.get.mockReturnValue({ prompts: { bash: '[{worktree}]$ ' } });
      portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });
      portManager.isPortInUse = jest.fn().mockResolvedValue(false);

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      expect(spawn).toHaveBeenCalledWith(
        '/bin/bash',
        expect.arrayContaining(['--rcfile', expect.stringContaining('wt-bashrc-')]),
        expect.any(Object)
      );
    });

    test('handles zsh shell with PROMPT environment variable', async () => {
      process.env.SHELL = '/usr/bin/zsh';
      config.get.mockReturnValue({ prompts: { zsh: '%F{blue}{worktree}%f %% ' } });
      portManager.getPorts = jest.fn().mockReturnValue({});

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      expect(spawn).toHaveBeenCalledWith(
        '/usr/bin/zsh',
        [],
        expect.objectContaining({
          env: expect.objectContaining({
            PROMPT: expect.stringContaining('wt-feature')
          })
        })
      );
    });

    test('handles fish shell with init command', async () => {
      process.env.SHELL = '/usr/bin/fish';
      config.get.mockReturnValue({ prompts: { fish: '{worktree}> ' } });
      portManager.getPorts = jest.fn().mockReturnValue({});

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      expect(spawn).toHaveBeenCalledWith(
        '/usr/bin/fish',
        expect.arrayContaining(['--init-command', expect.stringContaining('function fish_prompt')]),
        expect.any(Object)
      );
    });

    test('handles PowerShell on Windows', async () => {
      os.platform.mockReturnValue('win32');
      process.env.SHELL = 'powershell.exe';
      config.get.mockReturnValue({ prompts: { 'powershell.exe': 'PS {worktree}> ' } });
      portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000, storybook: 6006 });

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      expect(spawn).toHaveBeenCalledWith(
        'powershell.exe',
        expect.arrayContaining(['-NoExit', '-Command', expect.stringContaining('function prompt')]),
        expect.any(Object)
      );
    });

    test('handles pwsh (PowerShell Core)', async () => {
      os.platform.mockReturnValue('win32');
      process.env.SHELL = 'pwsh';
      config.get.mockReturnValue({});
      portManager.getPorts = jest.fn().mockReturnValue({});

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      expect(spawn).toHaveBeenCalledWith(
        'pwsh',
        expect.arrayContaining(['-NoExit', '-Command', expect.any(String)]),
        expect.any(Object)
      );
    });

    test('handles default shell with PS1 environment variable', async () => {
      process.env.SHELL = '/bin/unknownsh';
      config.get.mockReturnValue({ prompts: { default: '{worktree}> ' } });
      portManager.getPorts = jest.fn().mockReturnValue({});

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      expect(spawn).toHaveBeenCalledWith(
        '/bin/unknownsh',
        [],
        expect.objectContaining({
          env: expect.objectContaining({
            PS1: expect.stringContaining('wt-feature')
          })
        })
      );
    });

    test('uses default shell on Windows when SHELL is not set', async () => {
      os.platform.mockReturnValue('win32');
      delete process.env.SHELL;
      portManager.getPorts = jest.fn().mockReturnValue({});

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      expect(spawn).toHaveBeenCalledWith(
        'powershell.exe',
        expect.any(Array),
        expect.any(Object)
      );
    });

    test('uses default shell on Unix when SHELL is not set', async () => {
      os.platform.mockReturnValue('linux');
      delete process.env.SHELL;
      portManager.getPorts = jest.fn().mockReturnValue({});

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      expect(spawn).toHaveBeenCalledWith(
        '/bin/sh',
        expect.any(Array),
        expect.any(Object)
      );
    });

    test('handles shell spawn error', async () => {
      process.env.SHELL = '/bin/bash';
      portManager.getPorts = jest.fn().mockReturnValue({});
      fs.promises.readFile.mockRejectedValue(new Error('No package.json'));

      // Store the callbacks
      const callbacks = {};
      mockChildProcess.on.mockImplementation((event, callback) => {
        callbacks[event] = callback;
        return mockChildProcess;
      });

      // Start the switch command
      const promise = switchCommand('wt-feature', { shell: true });
      
      // Give the promise a chance to set up handlers
      await new Promise(resolve => process.nextTick(resolve));
      
      // Verify both handlers were registered
      expect(callbacks.error).toBeDefined();
      expect(callbacks.exit).toBeDefined();
      
      // Trigger the error handler
      callbacks.error(new Error('spawn failed'));
      
      // Wait for the promise to complete
      await promise;
      
      // Verify that the error was caught and process.exit was called
      expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Failed to spawn shell: spawn failed');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    test('handles non-zero exit code from shell', async () => {
      process.env.SHELL = '/bin/bash';
      portManager.getPorts = jest.fn().mockReturnValue({});

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(1); // Non-zero exit code
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      // Should still resolve, not reject
      expect(spawn).toHaveBeenCalled();
    });

    test('cleans up temporary bashrc file on process exit', async () => {
      process.env.SHELL = '/bin/bash';
      portManager.getPorts = jest.fn().mockReturnValue({});
      
      let exitHandler;
      const originalOn = process.on;
      process.on = jest.fn().mockImplementation((event, handler) => {
        if (event === 'exit') {
          exitHandler = handler;
        }
        return originalOn.call(process, event, handler);
      });

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      // Simulate process exit
      if (exitHandler) {
        exitHandler();
      }

      expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('wt-bashrc-'));
      
      process.on = originalOn;
    });

    test('buildPowerShellPrompt generates correct PowerShell code', async () => {
      os.platform.mockReturnValue('win32');
      delete process.env.SHELL; // PowerShell will be used as default on Windows
      const customPrompt = '{green}{worktree}{reset} at {cyan}{port:vite}{reset}> ';
      config.get.mockReturnValue({ prompts: { 'powershell.exe': customPrompt } });
      portManager.getPorts = jest.fn().mockReturnValue({ vite: 3000 });

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      const spawnCall = spawn.mock.calls[0];
      const psArgs = spawnCall?.[1]; // PowerShell args array
      
      expect(psArgs).toBeDefined();
      expect(psArgs[0]).toBe('-NoExit');
      expect(psArgs[1]).toBe('-Command');
      
      const psCommand = psArgs[2]; // The PowerShell command
      expect(psCommand).toContain('function prompt');
      expect(psCommand).toContain('$promptString = $promptString -replace \'{worktree}\', \'wt-feature\'');
      expect(psCommand).toContain('$promptString = $promptString -replace \'{port:vite}\', \'3000\'');
      expect(psCommand).toContain('$colorMap = @{');
      expect(psCommand).toContain('\'green\' = \'Green\'');
      expect(psCommand).toContain('\'cyan\' = \'Cyan\'');
    });

    test('prints message about returning to original directory on successful exit', async () => {
      process.env.SHELL = '/bin/bash';
      portManager.getPorts = jest.fn().mockReturnValue({});

      mockChildProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          callback(0);
        }
        return mockChildProcess;
      });

      await switchCommand('wt-feature', { shell: true });

      expect(mockConsoleLog).toHaveBeenCalledWith('\nReturned to original directory');
    });
  });
});