const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const execAsync = promisify(exec);

describe('wt init in empty repository', () => {
  let tempDir;
  const wtPath = path.join(__dirname, '../../wt.js');

  beforeEach(async () => {
    // Create a temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtt-empty-repo-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  test('detects master branch in empty repository', async () => {
    // Initialize git repo with default settings (which creates master branch)
    await execAsync('git init', { cwd: tempDir });
    
    // Check what the default branch is
    const { stdout: defaultBranch } = await execAsync('git symbolic-ref HEAD', { cwd: tempDir });
    const branchName = defaultBranch.replace('refs/heads/', '').trim();
    
    // Run wt init
    const { stdout, stderr } = await execAsync(`node ${wtPath} init`, {
      cwd: tempDir
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Initialized worktree configuration');
    
    // Check the config file
    const configPath = path.join(tempDir, '.worktree-config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // Should detect the actual default branch, not hardcode to 'main'
    expect(config.mainBranch).toBe(branchName);
  });

  test('detects main branch when explicitly set', async () => {
    // Initialize git repo
    await execAsync('git init', { cwd: tempDir });
    
    // Change default branch to main
    await execAsync('git symbolic-ref HEAD refs/heads/main', { cwd: tempDir });
    
    // Run wt init
    const { stdout, stderr } = await execAsync(`node ${wtPath} init`, {
      cwd: tempDir
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Initialized worktree configuration');
    
    // Check the config file
    const configPath = path.join(tempDir, '.worktree-config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    expect(config.mainBranch).toBe('main');
  });

  test('detects custom branch name and falls back to main', async () => {
    // Initialize git repo
    await execAsync('git init', { cwd: tempDir });
    
    // Change default branch to something unusual
    await execAsync('git symbolic-ref HEAD refs/heads/custom-branch', { cwd: tempDir });
    
    // Run wt init
    const { stdout, stderr } = await execAsync(`node ${wtPath} init`, {
      cwd: tempDir
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Initialized worktree configuration');
    
    // Check the config file
    const configPath = path.join(tempDir, '.worktree-config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    // Should fallback to 'main' for non-standard branch names
    expect(config.mainBranch).toBe('main');
  });

  test('detects branch after first commit', async () => {
    // Initialize git repo
    await execAsync('git init', { cwd: tempDir });
    await execAsync('git config user.email "test@example.com"', { cwd: tempDir });
    await execAsync('git config user.name "Test User"', { cwd: tempDir });
    
    // Create a file and commit
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'test content');
    await execAsync('git add .', { cwd: tempDir });
    await execAsync('git commit -m "Initial commit" --no-gpg-sign', { cwd: tempDir });
    
    // Get the current branch name
    const { stdout: branchName } = await execAsync('git branch --show-current', { cwd: tempDir });
    
    // Run wt init
    const { stdout, stderr } = await execAsync(`node ${wtPath} init`, {
      cwd: tempDir
    });

    expect(stderr).toBe('');
    expect(stdout).toContain('Initialized worktree configuration');
    
    // Check the config file
    const configPath = path.join(tempDir, '.worktree-config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    
    expect(config.mainBranch).toBe(branchName.trim());
  }, 10000); // Add explicit timeout
});