const { TestRepository } = require('../helpers/TestRepository');
const gitOps = require('../../lib/gitOps');
const path = require('path');
const fs = require('fs').promises;

describe('GitOps module (integration)', () => {
  let repo;
  
  // Helper function to compare paths across platforms
  function pathsEqual(path1, path2) {
    // Handle both absolute and relative paths
    const abs1 = path.isAbsolute(path1) ? path1 : path.resolve(path1);
    const abs2 = path.isAbsolute(path2) ? path2 : path.resolve(path2);
    
    // Normalize both paths to handle different formats
    const normalized1 = abs1.replace(/\\/g, '/');
    const normalized2 = abs2.replace(/\\/g, '/');
    
    // Case-insensitive comparison for Windows
    if (process.platform === 'win32') {
      return normalized1.toLowerCase() === normalized2.toLowerCase();
    }
    
    return normalized1 === normalized2;
  }
  
  // Helper to find worktree by path
  function hasWorktree(worktrees, targetPath) {
    // Try exact match first
    let found = worktrees.some(wt => pathsEqual(wt.path, targetPath));
    
    // If not found, try matching by the last part of the path (worktree name)
    if (!found) {
      const targetName = path.basename(targetPath);
      found = worktrees.some(wt => {
        const wtName = path.basename(wt.path);
        return wtName === targetName && wt.path.includes('.worktrees');
      });
    }
    
    // Debug output if not found and in CI
    if (!found && process.env.CI) {
      console.log('Worktree not found. Looking for:', targetPath);
      console.log('Available worktrees:');
      worktrees.forEach(wt => {
        console.log('  - Path:', wt.path);
        console.log('    Branch:', wt.branch);
      });
    }
    
    return found;
  }
  
  beforeEach(async () => {
    repo = new TestRepository();
    await repo.init();
    
    // Ensure we have a main branch
    await repo.git('checkout -b main');
    
    process.chdir(repo.dir);
    
    // Reinitialize gitOps with the test directory
    const simpleGit = require('simple-git');
    gitOps.git = simpleGit(repo.dir);
  });
  
  afterEach(async () => {
    process.chdir(__dirname);
    await repo.cleanup();
  });

  describe('getCurrentBranch', () => {
    test('returns current branch name', async () => {
      // We're already on main from beforeEach
      let branch = await gitOps.getCurrentBranch();
      expect(branch).toBe('main');
      
      // Now test with a different branch
      await repo.git('checkout -b feature-test');
      branch = await gitOps.getCurrentBranch();
      expect(branch).toBe('feature-test');
    });
  });

  describe('validateRepository', () => {
    test('succeeds when in git repository', async () => {
      await expect(gitOps.validateRepository()).resolves.toBe(true);
    });

    test('throws when not in git repository', async () => {
      // Create a non-git directory outside the test repo
      const fs = require('fs').promises;
      const os = require('os');
      const simpleGit = require('simple-git');
      const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'non-git-'));
      
      try {
        process.chdir(nonGitDir);
        
        // Reinitialize gitOps in the non-git directory
        gitOps.git = simpleGit(nonGitDir);
        
        await expect(gitOps.validateRepository()).rejects.toThrow('Not in a git repository');
      } finally {
        // Clean up
        process.chdir(repo.dir);
        await fs.rm(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  describe('createWorktree', () => {
    test('creates worktree for new branch with base branch', async () => {
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-feature');
      
      await gitOps.createWorktree(worktreePath, 'feature', 'main');
      
      // Verify worktree exists
      const worktrees = await gitOps.listWorktrees();
      expect(hasWorktree(worktrees, worktreePath)).toBe(true);
      
      // Verify branch was created
      const branches = await repo.git('branch');
      expect(branches.stdout).toContain('feature');
    });

    test('creates worktree for existing branch', async () => {
      // Create branch first
      await repo.git('checkout -b existing-feature');
      await repo.git('checkout main');
      
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-existing');
      
      await gitOps.createWorktree(worktreePath, 'existing-feature');
      
      // Verify worktree exists
      const worktrees = await gitOps.listWorktrees();
      expect(hasWorktree(worktrees, worktreePath)).toBe(true);
    });

    test('throws when trying to create new branch that already exists', async () => {
      await repo.git('checkout -b feature');
      await repo.git('checkout main');
      
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-feature');
      
      await expect(gitOps.createWorktree(worktreePath, 'feature', 'main'))
        .rejects.toThrow("Branch 'feature' already exists");
    });
  });

  describe('removeWorktree', () => {
    test('removes worktree', async () => {
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-feature');
      await gitOps.createWorktree(worktreePath, 'feature', 'main');
      
      await gitOps.removeWorktree(worktreePath);
      
      const worktrees = await gitOps.listWorktrees();
      expect(worktrees.some(wt => wt.path === worktreePath)).toBe(false);
    });

    test('force removes worktree with uncommitted changes', async () => {
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-feature');
      await gitOps.createWorktree(worktreePath, 'feature', 'main');
      
      // Add uncommitted changes
      const relativePath = path.relative(repo.dir, path.join(worktreePath, 'test.txt'));
      await repo.writeFile(relativePath, 'changes');
      
      await gitOps.removeWorktree(worktreePath, true);
      
      const worktrees = await gitOps.listWorktrees();
      expect(worktrees.some(wt => wt.path === worktreePath)).toBe(false);
    });
  });

  describe('listWorktrees', () => {
    test('returns parsed worktree list', async () => {
      const wt1 = path.join(repo.dir, '.worktrees', 'wt-feature1');
      const wt2 = path.join(repo.dir, '.worktrees', 'wt-feature2');
      
      await gitOps.createWorktree(wt1, 'feature1', 'main');
      await gitOps.createWorktree(wt2, 'feature2', 'main');
      
      const worktrees = await gitOps.listWorktrees();
      
      expect(worktrees.length).toBeGreaterThanOrEqual(3); // main + 2 worktrees
      expect(hasWorktree(worktrees, wt1)).toBe(true);
      expect(hasWorktree(worktrees, wt2)).toBe(true);
    });

    test('handles empty worktree list', async () => {
      const worktrees = await gitOps.listWorktrees();
      
      // Should at least have the main worktree
      expect(worktrees.length).toBeGreaterThanOrEqual(1);
      // The first worktree should be the main repo
      expect(hasWorktree(worktrees, repo.dir)).toBe(true);
    });
  });

  describe('hasUncommittedChanges', () => {
    test('returns true when there are uncommitted changes', async () => {
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-feature');
      await gitOps.createWorktree(worktreePath, 'feature', 'main');
      
      // Add uncommitted changes - using fs directly to ensure it's written
      const fs = require('fs').promises;
      const testFile = path.join(worktreePath, 'test.txt');
      await fs.writeFile(testFile, 'changes');
      
      const result = await gitOps.hasUncommittedChanges(worktreePath);
      
      expect(result).toBe(true);
    });

    test('returns false when working directory is clean', async () => {
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-feature');
      await gitOps.createWorktree(worktreePath, 'feature', 'main');
      
      const result = await gitOps.hasUncommittedChanges(worktreePath);
      
      expect(result).toBe(false);
    });
  });

  describe('checkBranchExists', () => {
    test('returns true when branch exists', async () => {
      await repo.git('checkout -b feature');
      await repo.git('checkout main');
      
      const result = await gitOps.checkBranchExists('feature');
      
      expect(result).toBe(true);
    });

    test('returns false when branch does not exist', async () => {
      const result = await gitOps.checkBranchExists('non-existent');
      
      expect(result).toBe(false);
    });
  });

  describe('mergeBranch', () => {
    test('merges branch into main branch', async () => {
      // Create and commit to feature branch
      await repo.git('checkout -b feature');
      await repo.writeFile('feature.txt', 'feature content');
      await repo.git('add feature.txt');
      await repo.git('commit -m "Add feature"');
      
      // Merge into main
      await gitOps.mergeBranch('feature', 'main');
      
      // Verify we're on main and file exists
      const branch = await gitOps.getCurrentBranch();
      expect(branch).toBe('main');
      
      const fileExists = await repo.exists('feature.txt');
      expect(fileExists).toBe(true);
    });
  });
});