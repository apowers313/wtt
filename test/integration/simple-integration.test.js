const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

describe('Simple integration test', () => {
  test('wt tool can show help', async () => {
    const wtPath = path.resolve(__dirname, '../../wt.js');
    
    try {
      const { stdout, stderr } = await execAsync(`node "${wtPath}" --help`);
      
      expect(stdout).toContain('Usage: wt [options] [command]');
      expect(stdout).toContain('init');
      expect(stdout).toContain('create');
    } catch (error) {
      console.error('Error output:', error.stderr);
      console.error('Error code:', error.code);
      throw error;
    }
  });

  test('wt tool can show version', async () => {
    const wtPath = path.resolve(__dirname, '../../wt.js');
    const { stdout } = await execAsync(`node "${wtPath}" --version`);
    
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('wt init works in a git repo', async () => {
    // Create a temporary directory
    const tempDir = path.join(os.tmpdir(), `wtt-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    try {
      // Initialize git repo
      await execAsync('git init', { cwd: tempDir });
      await execAsync('git config user.email "test@example.com"', { cwd: tempDir });
      await execAsync('git config user.name "Test User"', { cwd: tempDir });
      await execAsync('git config commit.gpgsign false', { cwd: tempDir });
      
      // Create initial commit
      await fs.writeFile(path.join(tempDir, 'README.md'), '# Test');
      await execAsync('git add .', { cwd: tempDir });
      await execAsync('git commit -m "Initial commit"', { cwd: tempDir });
      
      // Run wt init
      const wtPath = path.resolve(__dirname, '../../wt.js');
      const { stdout } = await execAsync(`node "${wtPath}" init`, { cwd: tempDir });
      
      expect(stdout).toContain('Initialized');
      
      // Check files were created
      expect(await fs.exists(path.join(tempDir, '.worktree-config.json'))).toBe(true);
      expect(await fs.exists(path.join(tempDir, '.worktrees'))).toBe(true);
    } catch (error) {
      console.error('Init test error:', error.message);
      console.error('stderr:', error.stderr);
      throw error;
    } finally {
      // Clean up
      try {
        await fs.remove(tempDir);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, 30000); // Increase timeout to 30s
});