const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const execAsync = promisify(exec);

describe('help command without config', () => {
  let tempDir;
  const wtPath = path.join(__dirname, '../../wt.js');

  beforeEach(async () => {
    // Create a temporary directory outside of the project
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtt-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  test('help command should work without .worktree-config.json', async () => {
    // Change to temp directory and run help command
    const { stdout, stderr } = await execAsync(`node ${wtPath} help --version`, {
      cwd: tempDir
    });

    // Help command should execute without error
    expect(stderr).toBe('');
    expect(stdout.trim()).toBe('1.0.0');
  });

  test('help command should show topics without config', async () => {
    // We can't test interactive help easily, but we can test that it doesn't fail
    try {
      // This will timeout because it's waiting for input, but it shouldn't error immediately
      await execAsync(`echo "" | node ${wtPath} help`, {
        cwd: tempDir,
        timeout: 1000
      });
    } catch (error) {
      // Should timeout, not fail with config error
      expect(error.message).toContain('Command failed');
      expect(error.message).not.toContain('No worktree configuration found');
    }
  });

  test('init command should work without config', async () => {
    // Initialize git repo first
    await execAsync('git init', { cwd: tempDir });
    
    // Run init command
    const { stdout, stderr } = await execAsync(`node ${wtPath} init`, {
      cwd: tempDir
    });

    // Should succeed
    expect(stderr).toBe('');
    expect(stdout).toContain('Initialized worktree configuration');
    
    // Config file should exist
    const configPath = path.join(tempDir, '.worktree-config.json');
    expect(await fs.pathExists(configPath)).toBe(true);
  });

  test('other commands should fail without config', async () => {
    try {
      await execAsync(`node ${wtPath} list`, {
        cwd: tempDir
      });
      throw new Error('Expected command to fail');
    } catch (error) {
      // Check either stdout or stderr for the message
      const output = (error.stdout || '') + (error.stderr || '');
      expect(output).toMatch(/No worktree configuration found|must be run inside a git repository/);
    }
  });

  test('--help flag should work on any command without config', async () => {
    const { stdout, stderr } = await execAsync(`node ${wtPath} list --help`, {
      cwd: tempDir
    });

    // Should show help without requiring config
    expect(stderr).toBe('');
    expect(stdout).toContain('List all worktrees');
  });

  test('-h flag should work without config', async () => {
    const { stdout, stderr } = await execAsync(`node ${wtPath} -h`, {
      cwd: tempDir
    });

    // Should show general help
    expect(stderr).toBe('');
    expect(stdout).toContain('Git Worktree Tool');
    expect(stdout).toContain('Commands:');
  });
});