const { expect } = require('chai');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { getCurrentWorktree } = require('../../lib/currentWorktree');

describe('getCurrentWorktree', () => {
  let testDir;
  let worktreesDir;
  let worktreeDir;

  beforeEach(async () => {
    // Create a temporary directory structure
    testDir = path.join(os.tmpdir(), `wtt-currentWorktree-test-${Date.now()}`);
    worktreesDir = path.join(testDir, '.worktrees');
    worktreeDir = path.join(worktreesDir, 'test-feature');
    
    await fs.mkdir(worktreeDir, { recursive: true });
    
    // Create a fake .git directory to simulate a repo
    await fs.mkdir(path.join(testDir, '.git'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should return null when not in a worktree', async () => {
    const result = await getCurrentWorktree(testDir);
    expect(result).to.be.null;
  });

  it('should return null when in .worktrees directory but not in a specific worktree', async () => {
    const result = await getCurrentWorktree(worktreesDir);
    expect(result).to.be.null;
  });

  it('should detect worktree name when in worktree root', async () => {
    const result = await getCurrentWorktree(worktreeDir);
    expect(result).to.equal('test-feature');
  });

  it('should detect worktree name when in worktree subdirectory', async () => {
    const subDir = path.join(worktreeDir, 'src', 'components');
    await fs.mkdir(subDir, { recursive: true });
    
    const result = await getCurrentWorktree(subDir);
    expect(result).to.equal('test-feature');
  });

  it('should handle deeply nested subdirectories', async () => {
    const deepDir = path.join(worktreeDir, 'src', 'components', 'ui', 'buttons');
    await fs.mkdir(deepDir, { recursive: true });
    
    const result = await getCurrentWorktree(deepDir);
    expect(result).to.equal('test-feature');
  });

  it('should handle worktree names with hyphens', async () => {
    const complexWorktreeDir = path.join(worktreesDir, 'feature-auth-system');
    await fs.mkdir(complexWorktreeDir, { recursive: true });
    
    const result = await getCurrentWorktree(complexWorktreeDir);
    expect(result).to.equal('feature-auth-system');
  });

  it('should return null for invalid worktree paths', async () => {
    // Test with path that looks like worktree but has invalid characters
    const invalidDir = path.join(worktreesDir, '..', 'escape');
    await fs.mkdir(invalidDir, { recursive: true });
    
    const result = await getCurrentWorktree(invalidDir);
    expect(result).to.be.null;
  });

  it('should return null when git repo root cannot be found', async () => {
    // Create a directory outside of the git repo structure
    const nonRepoDir = path.join(os.tmpdir(), `wtt-non-repo-${Date.now()}`);
    await fs.mkdir(nonRepoDir, { recursive: true });
    
    try {
      const result = await getCurrentWorktree(nonRepoDir);
      expect(result).to.be.null;
    } finally {
      await fs.rm(nonRepoDir, { recursive: true, force: true });
    }
  });

  it('should use current working directory when no startDir provided', async () => {
    const originalCwd = process.cwd();
    
    try {
      process.chdir(worktreeDir);
      const result = await getCurrentWorktree();
      expect(result).to.equal('test-feature');
    } finally {
      process.chdir(originalCwd);
    }
  });
});