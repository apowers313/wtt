const { TestRepository } = require('../helpers/TestRepository');
const gitOps = require('../../lib/gitOps');
const path = require('path');
const fs = require('fs').promises;

describe('GitOps module (integration)', () => {
  let repo;
  
  // Helper function to compare paths across platforms
  function pathsEqual(path1, path2) {
    // Normalize both paths to handle different formats
    const normalize = (p) => {
      // Convert to absolute path if needed
      const abs = path.isAbsolute(p) ? p : path.resolve(p);
      // Use forward slashes and lowercase for comparison
      return abs.replace(/\\/g, '/').toLowerCase();
    };
    
    let normalized1 = normalize(path1);
    let normalized2 = normalize(path2);
    
    // Direct comparison first
    if (normalized1 === normalized2) {
      return true;
    }
    
    // On Windows, we need a more flexible comparison
    if (process.platform === 'win32') {
      // Strategy: Compare the meaningful parts of the path
      // The important parts are the test directory name and worktree name
      
      // Extract the last meaningful segments from both paths
      const getLastSegments = (path, count) => {
        const parts = path.split('/');
        return parts.slice(-count).join('/');
      };
      
      // For worktree paths, the last 2-3 segments are usually enough
      // e.g., "wtt-tests-xxxxx/main" or ".worktrees/wt-feature"
      for (let segmentCount = 2; segmentCount <= 4; segmentCount++) {
        const end1 = getLastSegments(normalized1, segmentCount);
        const end2 = getLastSegments(normalized2, segmentCount);
        
        if (end1 === end2) {
          // Make sure we're comparing meaningful paths
          if (end1.includes('wtt-tests') || end1.includes('.worktrees')) {
            return true;
          }
        }
      }
      
      // Special case: if one path contains the other's ending
      // This handles cases like "C:/Users/RUNNER~1/AppData/Local/Temp/wtt-tests-xxxxx"
      // vs "D:/a/wtt/wtt/wtt-tests-xxxxx"
      const testDirPattern = /wtt-tests-[a-z0-9]+/i;
      const match1 = normalized1.match(testDirPattern);
      const match2 = normalized2.match(testDirPattern);
      
      if (match1 && match2 && match1[0] === match2[0]) {
        // Same test directory, check if the rest matches
        const idx1 = normalized1.indexOf(match1[0]);
        const idx2 = normalized2.indexOf(match2[0]);
        const suffix1 = normalized1.substring(idx1);
        const suffix2 = normalized2.substring(idx2);
        
        if (suffix1 === suffix2) {
          return true;
        }
      }
    }
    
    return false;
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
    
    // Debug output if not found and in CI (enhanced debugging)
    if (!found && (process.env.CI || process.env.DEBUG_TESTS)) {
      console.log('\n[DEBUG] hasWorktree failed to find match:');
      console.log('  Looking for:', targetPath);
      console.log('  Target basename:', path.basename(targetPath));
      console.log('  Platform:', process.platform);
      
      if (process.platform === 'win32') {
        console.log('  Normalized target:', targetPath.replace(/\\/g, '/').toLowerCase());
      }
      
      console.log('  Available worktrees:');
      worktrees.forEach((wt, index) => {
        console.log(`    ${index}: Path: ${wt.path}`);
        console.log(`    ${index}: Branch: ${wt.branch}`);
        console.log(`    ${index}: Basename: ${path.basename(wt.path)}`);
        
        if (process.platform === 'win32') {
          console.log(`    ${index}: Normalized: ${wt.path.replace(/\\/g, '/').toLowerCase()}`);
          console.log(`    ${index}: pathsEqual result: ${pathsEqual(wt.path, targetPath)}`);
        }
      });
    }
    
    return found;
  }
  
  beforeEach(async () => {
    repo = new TestRepository();
    await repo.init();
    
    // Debug logging for CI setup
    if (process.env.CI || process.env.DEBUG_TESTS) {
      console.log('\n[DEBUG] GitOps test setup:');
      console.log('  Repo directory:', repo.dir);
      console.log('  Platform:', process.platform);
      console.log('  Current working dir before chdir:', process.cwd());
    }
    
    // Ensure we have a main branch
    await repo.git('checkout -b main');
    
    process.chdir(repo.dir);
    
    if (process.env.CI || process.env.DEBUG_TESTS) {
      console.log('  Current working dir after chdir:', process.cwd());
    }
    
    // Reinitialize gitOps with the test directory
    const simpleGit = require('simple-git');
    // Don't pass a directory to simpleGit since we've already changed to that directory
    gitOps.git = simpleGit();
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
      
      if (process.env.CI || process.env.DEBUG_TESTS) {
        console.log('\n[DEBUG] createWorktree test:');
        console.log('  Target worktree path:', worktreePath);
        console.log('  Platform:', process.platform);
        console.log('  Repo dir:', repo.dir);
      }
      
      // Ensure the parent directory exists
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });
      
      await gitOps.createWorktree(worktreePath, 'feature', 'main');
      
      // Verify worktree exists
      const worktrees = await gitOps.listWorktrees();
      
      if (process.env.CI || process.env.DEBUG_TESTS) {
        console.log('  Found worktrees after creation:');
        worktrees.forEach((wt, index) => {
          console.log(`    ${index}: ${wt.path} (${wt.branch})`);
        });
        console.log('  Looking for path:', worktreePath);
        console.log('  hasWorktree result:', hasWorktree(worktrees, worktreePath));
      }
      
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
      
      // Ensure the parent directory exists
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });
      
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
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });
      await gitOps.createWorktree(worktreePath, 'feature', 'main');
      
      await gitOps.removeWorktree(worktreePath);
      
      const worktrees = await gitOps.listWorktrees();
      expect(worktrees.some(wt => wt.path === worktreePath)).toBe(false);
    });

    test('force removes worktree with uncommitted changes', async () => {
      const worktreePath = path.join(repo.dir, '.worktrees', 'wt-feature');
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });
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
      
      await fs.mkdir(path.dirname(wt1), { recursive: true });
      await gitOps.createWorktree(wt1, 'feature1', 'main');
      await gitOps.createWorktree(wt2, 'feature2', 'main');
      
      const worktrees = await gitOps.listWorktrees();
      
      expect(worktrees.length).toBeGreaterThanOrEqual(3); // main + 2 worktrees
      expect(hasWorktree(worktrees, wt1)).toBe(true);
      expect(hasWorktree(worktrees, wt2)).toBe(true);
    });

    test('handles empty worktree list', async () => {
      const worktrees = await gitOps.listWorktrees();
      
      // Enhanced debugging for CI
      if (process.env.CI || process.env.DEBUG_TESTS) {
        console.log('\n[DEBUG] listWorktrees test:');
        console.log('  Platform:', process.platform);
        console.log('  Main repo dir:', repo.dir);
        console.log('  Found worktrees count:', worktrees.length);
        console.log('  Working directory:', process.cwd());
        
        worktrees.forEach((wt, index) => {
          console.log(`  Worktree ${index}:`);
          console.log(`    Path: ${wt.path}`);
          console.log(`    Branch: ${wt.branch}`);
          console.log(`    Bare: ${wt.bare || false}`);
          console.log(`    Detached: ${wt.detached || false}`);
          
          if (process.platform === 'win32') {
            console.log(`    Normalized path: ${wt.path.replace(/\\/g, '/').toLowerCase()}`);
            console.log(`    Path ends with: ${path.basename(wt.path)}`);
          }
        });
        
        if (process.platform === 'win32') {
          console.log('  Main repo normalized:', repo.dir.replace(/\\/g, '/').toLowerCase());
          console.log('  Path comparison results:');
          worktrees.forEach((wt, index) => {
            const match = pathsEqual(wt.path, repo.dir);
            console.log(`    Worktree ${index} matches main: ${match}`);
          });
        }
      }
      
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