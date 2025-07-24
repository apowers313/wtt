const { expect } = require('chai');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

describe('Subdirectory Command Execution', () => {
  let tempDir;
  let repoDir;
  let wtPath;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = path.join(os.tmpdir(), `wtt-subdir-test-${Date.now()}`);
    repoDir = path.join(tempDir, 'test-repo');
    await fs.mkdir(repoDir, { recursive: true });
    
    // Get the actual wt.js path
    wtPath = path.join(__dirname, '..', '..', 'wt.js');
    
    // Initialize git repo
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "test@example.com"', { cwd: repoDir });
    execSync('git config user.name "Test User"', { cwd: repoDir });
    execSync('git config commit.gpgsign false', { cwd: repoDir });
    
    // Create initial commit
    const readmePath = path.join(repoDir, 'README.md');
    await fs.writeFile(readmePath, '# Test Repo');
    execSync('git add README.md', { cwd: repoDir });
    execSync('git commit -m "Initial commit"', { cwd: repoDir });
    
    // Initialize wt
    execSync(`node ${wtPath} init`, { cwd: repoDir });
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('wt init', () => {
    it('should work from subdirectory', async () => {
      // Remove existing config
      await fs.unlink(path.join(repoDir, '.worktree-config.json'));
      
      const subDir = path.join(repoDir, 'src', 'components');
      await fs.mkdir(subDir, { recursive: true });
      
      // Run init from subdirectory
      const output = execSync(`node ${wtPath} init`, { cwd: subDir }).toString();
      
      expect(output).to.include('Initialized worktree configuration');
      
      // Verify config was created in repo root, not subdirectory
      const configPath = path.join(repoDir, '.worktree-config.json');
      const configExists = await fs.access(configPath).then(() => true).catch(() => false);
      expect(configExists).to.be.true;
      
      // Verify config doesn't exist in subdirectory
      const wrongConfigPath = path.join(subDir, '.worktree-config.json');
      const wrongConfigExists = await fs.access(wrongConfigPath).then(() => true).catch(() => false);
      expect(wrongConfigExists).to.be.false;
    });
  });

  describe('wt create', () => {
    it('should create worktree when run from subdirectory', async () => {
      const subDir = path.join(repoDir, 'src', 'lib');
      await fs.mkdir(subDir, { recursive: true });
      
      // Create worktree from subdirectory
      const output = execSync(`node ${wtPath} create feature-test --from master`, { 
        cwd: subDir 
      }).toString();
      
      expect(output).to.include('Worktree created at');
      expect(output).to.include('.worktrees/feature-test');
      
      // Verify worktree was created in correct location
      const worktreePath = path.join(repoDir, '.worktrees', 'feature-test');
      const worktreeExists = await fs.access(worktreePath).then(() => true).catch(() => false);
      expect(worktreeExists).to.be.true;
    });

    it('should handle deeply nested subdirectories', async () => {
      const deepDir = path.join(repoDir, 'src', 'components', 'ui', 'buttons', 'primary');
      await fs.mkdir(deepDir, { recursive: true });
      
      const output = execSync(`node ${wtPath} create deep-feature --from master`, { 
        cwd: deepDir 
      }).toString();
      
      expect(output).to.include('Worktree created at');
      
      // Verify worktree in correct location
      const worktreePath = path.join(repoDir, '.worktrees', 'deep-feature');
      const worktreeExists = await fs.access(worktreePath).then(() => true).catch(() => false);
      expect(worktreeExists).to.be.true;
    });
  });

  describe('wt list', () => {
    beforeEach(async () => {
      // Create a test worktree
      execSync(`node ${wtPath} create list-test --from master`, { cwd: repoDir });
    });

    it('should list worktrees from subdirectory', async () => {
      const subDir = path.join(repoDir, 'tests');
      await fs.mkdir(subDir, { recursive: true });
      
      const output = execSync(`node ${wtPath} list`, { cwd: subDir }).toString();
      
      expect(output).to.include('list-test');
      expect(output).to.include('vite:');
      expect(output).to.include('storybook:');
    });

    it('should show verbose output from subdirectory', async () => {
      const subDir = path.join(repoDir, 'docs');
      await fs.mkdir(subDir, { recursive: true });
      
      const output = execSync(`node ${wtPath} list -v`, { cwd: subDir }).toString();
      
      expect(output).to.include('WORKTREE');
      expect(output).to.include('BRANCH');
      expect(output).to.include('PORTS');
      expect(output).to.include('STATUS');
    });
  });

  describe('wt switch', () => {
    beforeEach(async () => {
      // Create a test worktree
      execSync(`node ${wtPath} create switch-test --from master`, { cwd: repoDir });
    });

    it('should switch to worktree from subdirectory', async () => {
      const subDir = path.join(repoDir, 'src', 'utils');
      await fs.mkdir(subDir, { recursive: true });
      
      const output = execSync(`node ${wtPath} switch switch-test --no-shell`, { 
        cwd: subDir 
      }).toString();
      
      expect(output).to.include('Switching to worktree');
      expect(output).to.include('switch-test');
      expect(output).to.include('Assigned ports');
    });
  });

  describe('wt ports', () => {
    beforeEach(async () => {
      // Create test worktrees
      execSync(`node ${wtPath} create ports-test-1 --from master`, { cwd: repoDir });
      execSync(`node ${wtPath} create ports-test-2 --from master`, { cwd: repoDir });
    });

    it('should show all ports from subdirectory', async () => {
      const subDir = path.join(repoDir, 'config');
      await fs.mkdir(subDir, { recursive: true });
      
      const output = execSync(`node ${wtPath} ports`, { cwd: subDir }).toString();
      
      expect(output).to.include('ports-test-1');
      expect(output).to.include('ports-test-2');
      expect(output).to.include('Port assignments for all worktrees');
    });

    it('should show specific worktree ports from subdirectory', async () => {
      const subDir = path.join(repoDir, 'scripts');
      await fs.mkdir(subDir, { recursive: true });
      
      const output = execSync(`node ${wtPath} ports ports-test-1`, { cwd: subDir }).toString();
      
      expect(output).to.include('ports-test-1');
      expect(output).to.include('vite:');
      expect(output).not.to.include('ports-test-2');
    });
  });

  describe('wt remove', () => {
    beforeEach(async () => {
      // Create a test worktree
      execSync(`node ${wtPath} create remove-test --from master`, { cwd: repoDir });
    });

    it('should remove worktree from subdirectory', async () => {
      const subDir = path.join(repoDir, 'build');
      await fs.mkdir(subDir, { recursive: true });
      
      const output = execSync(`node ${wtPath} remove remove-test --force`, { 
        cwd: subDir 
      }).toString();
      
      expect(output).to.include('Removed worktree');
      expect(output).to.include('Released ports');
      
      // Verify worktree was removed
      const worktreePath = path.join(repoDir, '.worktrees', 'remove-test');
      const worktreeExists = await fs.access(worktreePath).then(() => true).catch(() => false);
      expect(worktreeExists).to.be.false;
    });
  });

  describe('Commands from within worktree', () => {
    let worktreePath;

    beforeEach(async () => {
      // Create a worktree
      execSync(`node ${wtPath} create worktree-commands --from master`, { cwd: repoDir });
      worktreePath = path.join(repoDir, '.worktrees', 'worktree-commands');
    });

    it('should list worktrees from within a worktree', async () => {
      const output = execSync(`node ${wtPath} list`, { cwd: worktreePath }).toString();
      
      expect(output).to.include('worktree-commands');
      expect(output).to.include('Worktrees:');
    });

    it('should create new worktree from within another worktree', async () => {
      const output = execSync(`node ${wtPath} create from-worktree --from master`, { 
        cwd: worktreePath 
      }).toString();
      
      expect(output).to.include('Worktree created at');
      
      // Verify it was created in main repo's .worktrees
      const newWorktreePath = path.join(repoDir, '.worktrees', 'from-worktree');
      const exists = await fs.access(newWorktreePath).then(() => true).catch(() => false);
      expect(exists).to.be.true;
    });

    it('should work from subdirectory within worktree', async () => {
      const worktreeSubDir = path.join(worktreePath, 'src', 'nested');
      await fs.mkdir(worktreeSubDir, { recursive: true });
      
      const output = execSync(`node ${wtPath} list`, { cwd: worktreeSubDir }).toString();
      
      expect(output).to.include('worktree-commands');
    });
  });

  describe('Edge cases', () => {
    it('should handle worktree with committed .worktree-config.json', async () => {
      // Create worktree
      execSync(`node ${wtPath} create config-test --from master`, { cwd: repoDir });
      const worktreePath = path.join(repoDir, '.worktrees', 'config-test');
      
      // Copy config to worktree (simulating it being committed)
      const mainConfig = path.join(repoDir, '.worktree-config.json');
      const worktreeConfig = path.join(worktreePath, '.worktree-config.json');
      await fs.copyFile(mainConfig, worktreeConfig);
      
      // Commands should still use main repo config
      const output = execSync(`node ${wtPath} list`, { cwd: worktreePath }).toString();
      expect(output).to.include('config-test');
      
      // Create another worktree from within the first one
      const output2 = execSync(`node ${wtPath} create nested-config --from master`, { 
        cwd: worktreePath 
      }).toString();
      expect(output2).to.include('Worktree created at');
      
      // Verify it was created in main repo, not nested
      const correctPath = path.join(repoDir, '.worktrees', 'nested-config');
      const incorrectPath = path.join(worktreePath, '.worktrees', 'nested-config');
      
      const correctExists = await fs.access(correctPath).then(() => true).catch(() => false);
      const incorrectExists = await fs.access(incorrectPath).then(() => true).catch(() => false);
      
      expect(correctExists).to.be.true;
      expect(incorrectExists).to.be.false;
    });

    it('should fail gracefully when not in a git repository', async () => {
      const nonGitDir = path.join(tempDir, 'not-git');
      await fs.mkdir(nonGitDir, { recursive: true });
      
      try {
        execSync(`node ${wtPath} list`, { cwd: nonGitDir, stdio: 'pipe' });
        expect.fail('Should have thrown an error');
      } catch (error) {
        // The error message might be in stdout or stderr
        const output = error.stdout ? error.stdout.toString() : '';
        const errorOutput = error.stderr ? error.stderr.toString() : '';
        const fullOutput = output + errorOutput + error.message;
        // Either error message is acceptable - depends on which check fails first
        const hasGitError = fullOutput.includes('must be run inside a git repository');
        const hasConfigError = fullOutput.includes('No worktree configuration found');
        expect(hasGitError || hasConfigError).to.be.true;
      }
    });
  });
});