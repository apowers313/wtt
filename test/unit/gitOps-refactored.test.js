const { TestRepository } = require('../helpers/TestRepository');
const gitOps = require('../../lib/gitOps-refactored');
const PathUtils = require('../../lib/pathUtils');
const PlatformTestUtils = require('../helpers/PlatformTestUtils');
const path = require('path');
const fs = require('fs').promises;

describe('GitOps module - Refactored', () => {
  let repo;
  
  beforeEach(async () => {
    repo = new TestRepository();
    await repo.init();
    
    // Ensure we have a main branch
    await repo.git('checkout -b main');
    
    process.chdir(repo.dir);
    
    // Reinitialize gitOps with the test directory
    const simpleGit = require('simple-git');
    gitOps.git = simpleGit();
  });
  
  afterEach(async () => {
    process.chdir(__dirname);
    await repo.cleanup();
  });

  describe('createWorktree', () => {
    test('creates worktree for new branch with base branch', async () => {
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-feature');
      
      // Ensure the parent directory exists
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });
      
      await gitOps.createWorktree(worktreePath, 'feature', 'main');
      
      // Verify worktree exists using platform-agnostic utilities
      const worktrees = await gitOps.listWorktrees();
      
      // Use the new utility to find worktree
      PlatformTestUtils.expectWorktreeExists(worktrees, 'wt-feature');
      
      // Verify branch was created
      const branches = await repo.git('branch');
      expect(branches.stdout).toContain('feature');
    });

    test('creates worktree for existing branch', async () => {
      // Create branch first
      await repo.git('checkout -b existing-feature');
      await repo.git('checkout main');
      
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-existing');
      
      // Ensure the parent directory exists
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });
      
      await gitOps.createWorktree(worktreePath, 'existing-feature');
      
      // Verify worktree exists
      const worktrees = await gitOps.listWorktrees();
      PlatformTestUtils.expectWorktreeExists(worktrees, 'wt-existing');
    });
  });

  describe('listWorktrees', () => {
    test('returns parsed worktree list with proper paths', async () => {
      const wt1 = path.join(repo.dir, '.worktrees', 'wt-feature1');
      const wt2 = path.join(repo.dir, '.worktrees', 'wt-feature2');
      
      await fs.mkdir(path.dirname(wt1), { recursive: true });
      await gitOps.createWorktree(wt1, 'feature1', 'main');
      await gitOps.createWorktree(wt2, 'feature2', 'main');
      
      const worktrees = await gitOps.listWorktrees();
      
      // Should have main + 2 worktrees
      expect(worktrees.length).toBeGreaterThanOrEqual(3);
      
      // Find worktrees using the utility
      const feature1 = PlatformTestUtils.findWorktreeByName(worktrees, 'wt-feature1');
      const feature2 = PlatformTestUtils.findWorktreeByName(worktrees, 'wt-feature2');
      
      expect(feature1).toBeTruthy();
      expect(feature2).toBeTruthy();
      expect(feature1.branch).toBe('feature1');
      expect(feature2.branch).toBe('feature2');
    });

    test('handles empty worktree list correctly', async () => {
      const worktrees = await gitOps.listWorktrees();
      
      // Should at least have the main worktree
      expect(worktrees.length).toBeGreaterThanOrEqual(1);
      
      // Find the main worktree
      const mainWorktree = worktrees.find(wt => 
        !PathUtils.isWorktreePath(wt.path) && wt.branch === 'main'
      );
      
      expect(mainWorktree).toBeTruthy();
    });
  });

  describe('hasUncommittedChanges', () => {
    test('detects uncommitted changes in worktree', async () => {
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-feature');
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });
      await gitOps.createWorktree(worktreePath, 'feature', 'main');
      
      // Add uncommitted changes
      const testFile = path.join(worktreePath, 'test.txt');
      await fs.writeFile(testFile, 'changes');
      
      // Wait for file system to settle on Windows
      await PlatformTestUtils.waitFor(async () => {
        const result = await gitOps.hasUncommittedChanges(worktreePath);
        return result === true;
      }, PlatformTestUtils.getTimeout());
      
      const result = await gitOps.hasUncommittedChanges(worktreePath);
      expect(result).toBe(true);
    });

    test('returns false for clean worktree', async () => {
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-feature');
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });
      await gitOps.createWorktree(worktreePath, 'feature', 'main');
      
      const result = await gitOps.hasUncommittedChanges(worktreePath);
      expect(result).toBe(false);
    });
  });
});