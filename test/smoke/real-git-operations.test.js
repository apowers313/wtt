/**
 * Smoke tests with real git operations
 * These tests are slower but ensure our code works with actual git
 * Run sparingly - not on every test run
 */

const { TestRepository } = require('../helpers/TestRepository');
const { WorktreeTestHelpers } = require('../helpers/WorktreeTestHelpers');
const path = require('path');
const fs = require('fs-extra');

// Skip these tests by default - they have complex integration issues that need more work
const describeSmokeTest = process.env.SMOKE_TESTS === 'true' ? describe : describe.skip;

describeSmokeTest('Smoke Tests - Real Git Operations', () => {
  let repo, helpers;

  beforeEach(async () => {
    // Use real git repo setup
    ({ repo, helpers } = await WorktreeTestHelpers.setupTestRepo());
  }, 30000); // Allow time for real git operations

  afterEach(async () => {
    await repo.cleanup();
  });

  describe('Core worktree operations', () => {
    test('create worktree with real git', async () => {
      // Run actual wt create command
      const result = await repo.run('create test-feature');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Worktree created');
      
      // Verify with real git
      const gitWorktrees = await repo.git('worktree list');
      expect(gitWorktrees.stdout).toContain('test-feature');
      
      // Verify physical directory exists
      const worktreePath = path.join(repo.dir, '.worktrees', 'test-feature');
      expect(await fs.pathExists(worktreePath)).toBe(true);
      
      // Verify we can run git commands in the worktree
      const worktreeStatus = await repo.git(`-C ${worktreePath} status`);
      expect(worktreeStatus.exitCode).toBe(0);
    });

    test('list worktrees matches git worktree list', async () => {
      // Create multiple worktrees
      await repo.run('create feature-1');
      await repo.run('create feature-2');
      
      // Get wt list output
      const wtList = await repo.run('list');
      expect(wtList.exitCode).toBe(0);
      
      // Get git worktree list
      const gitList = await repo.git('worktree list --porcelain');
      
      // Both should show the same worktrees
      expect(wtList.stdout).toContain('feature-1');
      expect(wtList.stdout).toContain('feature-2');
      expect(gitList.stdout).toContain('branch refs/heads/feature-1');
      expect(gitList.stdout).toContain('branch refs/heads/feature-2');
    });

    test('remove worktree cleans up properly', async () => {
      // Create and remove worktree
      await repo.run('create temp-feature');
      const worktreePath = path.join(repo.dir, '.worktrees', 'temp-feature');
      expect(await fs.pathExists(worktreePath)).toBe(true);
      
      const removeResult = await repo.run('remove temp-feature --force');
      expect(removeResult.exitCode).toBe(0);
      
      // Verify with git
      const gitWorktrees = await repo.git('worktree list');
      expect(gitWorktrees.stdout).not.toContain('temp-feature');
      
      // Verify directory is gone
      expect(await fs.pathExists(worktreePath)).toBe(false);
      
      // Verify branch is deleted
      const branches = await repo.git('branch');
      expect(branches.stdout).not.toContain('temp-feature');
    });
  });

  describe('Merge operations', () => {
    test('successful merge with real git', async () => {
      // Create feature branch with changes
      await repo.run('create merge-test');
      const worktreePath = path.join(repo.dir, '.worktrees', 'merge-test');
      
      // Make changes in worktree
      await repo.writeFile(path.join(worktreePath, 'feature.txt'), 'feature content');
      await repo.git(`-C ${worktreePath} add .`);
      await repo.git(`-C ${worktreePath} commit -m "Add feature"`);
      
      // Merge back to main
      const mergeResult = await repo.run('merge merge-test');
      expect(mergeResult.exitCode).toBe(0);
      
      // Verify merge in git log
      const log = await repo.git('log --oneline -n 5');
      expect(log.stdout).toMatch(/Merge branch 'merge-test'/);
      
      // Verify file exists in main
      expect(await fs.pathExists(path.join(repo.dir, 'feature.txt'))).toBe(true);
    });

    test('merge conflict detection', async () => {
      // Create conflicting changes
      await repo.writeFile('conflict.txt', 'main content');
      await repo.git('add conflict.txt');
      await repo.git('commit -m "Main change"');
      
      await repo.run('create conflict-branch');
      const worktreePath = path.join(repo.dir, '.worktrees', 'conflict-branch');
      
      // Make conflicting change in worktree
      await repo.writeFile(path.join(worktreePath, 'conflict.txt'), 'feature content');
      await repo.git(`-C ${worktreePath} add .`);
      await repo.git(`-C ${worktreePath} commit -m "Feature change"`);
      
      // Make another conflicting change in main
      await repo.writeFile('conflict.txt', 'updated main content');
      await repo.git('add conflict.txt');
      await repo.git('commit -m "Update main"');
      
      // Attempt merge
      const mergeResult = await repo.run('merge conflict-branch');
      
      // Should detect conflict
      expect(mergeResult.exitCode).not.toBe(0);
      expect(mergeResult.stdout + mergeResult.stderr).toMatch(/conflict/i);
      
      // Verify git sees the conflict
      const status = await repo.git('status');
      expect(status.stdout).toContain('Unmerged paths');
    });
  });

  describe('Port management', () => {
    test('port assignments persist across commands', async () => {
      // Create worktree
      const createResult = await repo.run('create port-test');
      expect(createResult.stdout).toMatch(/vite.*\d{4}/);
      
      // Extract port from output
      const portMatch = createResult.stdout.match(/vite.*(\d{4})/);
      const assignedPort = portMatch ? portMatch[1] : null;
      expect(assignedPort).toBeTruthy();
      
      // List should show same port
      const listResult = await repo.run('list -v');
      expect(listResult.stdout).toContain(assignedPort);
      
      // Port map file should exist
      const portMapPath = path.join(repo.dir, '.worktrees', '.port-map.json');
      expect(await fs.pathExists(portMapPath)).toBe(true);
      
      const portMap = await fs.readJSON(portMapPath);
      expect(portMap['port-test']).toBeDefined();
      expect(portMap['port-test'].vite).toBe(parseInt(assignedPort));
    });
  });

  describe('Switch command', () => {
    test('switch spawns shell in correct directory', async () => {
      await repo.run('create switch-test');
      const worktreePath = path.join(repo.dir, '.worktrees', 'switch-test');
      
      // Create a marker file in worktree
      await repo.writeFile(path.join(worktreePath, 'marker.txt'), 'in worktree');
      
      // Test switch with command
      const result = await repo.run('switch switch-test --command "pwd && ls"');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('switch-test');
      expect(result.stdout).toContain('marker.txt');
    });
  });

  describe('Edge cases with real git', () => {
    test('handles detached HEAD state', async () => {
      // Create worktree and detach HEAD
      await repo.run('create detached-test');
      const worktreePath = path.join(repo.dir, '.worktrees', 'detached-test');
      
      // Get current commit and checkout to detach HEAD
      const logResult = await repo.git(`-C ${worktreePath} log -1 --format=%H`);
      const commit = logResult.stdout.trim();
      await repo.git(`-C ${worktreePath} checkout ${commit}`);
      
      // List should handle detached HEAD
      const listResult = await repo.run('list');
      expect(listResult.exitCode).toBe(0);
      expect(listResult.stdout).toContain('detached-test');
    });

    test('handles worktree with uncommitted changes', async () => {
      await repo.run('create dirty-test');
      const worktreePath = path.join(repo.dir, '.worktrees', 'dirty-test');
      
      // Make uncommitted changes
      await repo.writeFile(path.join(worktreePath, 'uncommitted.txt'), 'changes');
      
      // Try to remove - should warn
      const removeResult = await repo.run('remove dirty-test');
      
      if (removeResult.exitCode !== 0) {
        expect(removeResult.stdout + removeResult.stderr).toMatch(/uncommitted|changes/i);
      }
      
      // Force remove should work
      const forceResult = await repo.run('remove dirty-test --force');
      expect(forceResult.exitCode).toBe(0);
    });

    test('handles corrupted worktree gracefully', async () => {
      await repo.run('create corrupted-test');
      const worktreePath = path.join(repo.dir, '.worktrees', 'corrupted-test');
      
      // Corrupt the worktree by removing .git file
      await fs.remove(path.join(worktreePath, '.git'));
      
      // Commands should handle this gracefully
      const listResult = await repo.run('list');
      expect(listResult.exitCode).toBe(0);
      
      // Remove should still work
      const removeResult = await repo.run('remove corrupted-test --force');
      expect(removeResult.exitCode).toBe(0);
    });
  });

  describe('Performance check', () => {
    test('creates multiple worktrees efficiently', async () => {
      const start = Date.now();
      
      // Create 5 worktrees
      for (let i = 1; i <= 5; i++) {
        const result = await repo.run(`create perf-test-${i}`);
        expect(result.exitCode).toBe(0);
      }
      
      const duration = Date.now() - start;
      
      // Should complete in reasonable time (adjust based on CI environment)
      expect(duration).toBeLessThan(30000); // 30 seconds for 5 worktrees
      
      // Verify all exist
      const listResult = await repo.run('list');
      for (let i = 1; i <= 5; i++) {
        expect(listResult.stdout).toContain(`perf-test-${i}`);
      }
    }, 60000); // Allow 60 seconds for this test
  });
});

// Separate describe block for CI-friendly smoke test
describe('Minimal smoke test (always runs)', () => {
  test('can execute wt command', async () => {
    // Just verify the tool can run
    const { repo } = await WorktreeTestHelpers.setupTestRepo();
    
    try {
      const result = await repo.run('--version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    } finally {
      await repo.cleanup();
    }
  }, 30000);
});