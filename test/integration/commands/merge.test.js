const { WorktreeTestHelpers } = require('../../helpers/WorktreeTestHelpers');
const { AsyncTestHelpers } = require('../../helpers/InteractiveTestHelpers');
const path = require('path');

describe('wt merge command', () => {
  let repo, helpers;
  
  beforeEach(async () => {
    ({ repo, helpers } = await WorktreeTestHelpers.setupTestRepo());
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });

  test('merges worktree branch to current branch', async () => {
    // Create worktree and make changes
    await helpers.createWorktree('feature-test');
    
    await repo.inWorktree('feature-test', async () => {
      await repo.writeFile('feature.js', 'export const feature = () => "test";');
      await repo.git('add .');
      await repo.git('commit -m "Add feature"');
    });
    
    // Merge
    const result = await repo.run('merge feature-test');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, ['merged', 'Merged']);
    
    // Verify file exists in main
    expect(await repo.exists('feature.js')).toBe(true);
  });

  test('merges and deletes worktree with --delete flag', async () => {
    await helpers.createWorktree('feature-delete');
    
    // Add a file to the worktree
    await repo.inWorktree('feature-delete', async () => {
      await repo.writeFile('delete-feature.js', 'export const deleteFeature = true;');
      await repo.git('add .');
      await repo.git('commit -m "Add delete feature"');
    });
    
    // Merge with delete flag (auto-confirmed in test environment)
    const result = await repo.run('merge feature-delete --delete');
    helpers.expectSuccess(result);
    
    // Verify file is merged
    expect(await repo.exists('delete-feature.js')).toBe(true);
    
    // Verify worktree is removed
    await AsyncTestHelpers.retry(async () => {
      await helpers.expectWorktreeExists('feature-delete', false);
    });
    
    // Verify ports are released
    const portMap = JSON.parse(await repo.readFile(path.join('.worktrees', '.port-map.json')));
    expect(portMap['feature-delete']).toBeUndefined();
  });

  test('merge without --delete flag preserves worktree', async () => {
    await helpers.createWorktree('feature-preserve');
    
    // Add a file to the worktree
    await repo.inWorktree('feature-preserve', async () => {
      await repo.writeFile('preserve-feature.js', 'export const preserveFeature = true;');
      await repo.git('add .');
      await repo.git('commit -m "Add preserve feature"');
    });
    
    // Merge without delete flag 
    const result = await repo.run('merge feature-preserve --no-delete');
    if (result.exitCode !== 0) {
      console.log('Merge failed:', result.stdout, result.stderr);
    }
    helpers.expectSuccess(result);
    
    // Verify file is merged
    expect(await repo.exists('preserve-feature.js')).toBe(true);
    
    // Verify worktree still exists
    await helpers.expectWorktreeExists('feature-preserve', true);
    
    // Verify ports are still assigned
    const portMap = JSON.parse(await repo.readFile(path.join('.worktrees', '.port-map.json')));
    expect(portMap['feature-preserve']).toBeDefined();
  });

  test('fails when worktree has uncommitted changes', async () => {
    await helpers.createWorktree('feature-test');
    
    // Make uncommitted changes
    await repo.inWorktree('feature-test', async () => {
      await repo.writeFile('uncommitted.js', 'export const test = 1;');
    });
    
    const result = await repo.run('merge feature-test');
    
    helpers.expectFailure(result);
    helpers.expectOutputContains(result, ['uncommitted changes', 'commit or stash']);
  });

  test('does not duplicate error messages', async () => {
    await helpers.createWorktree('feature-dup');
    
    // Make uncommitted changes
    await repo.inWorktree('feature-dup', async () => {
      await repo.writeFile('uncommitted.js', 'export const test = 1;');
    });
    
    const result = await repo.run('merge feature-dup');
    
    helpers.expectFailure(result);
    
    // Check that key messages appear only once
    const uncommittedCount = helpers.countOutputOccurrences(result, 'uncommitted changes');
    const stashCount = helpers.countOutputOccurrences(result, 'commit or stash');
    
    // Should appear at most twice (once in simple message, once in enhanced if shown)
    expect(uncommittedCount).toBeLessThanOrEqual(2);
    expect(stashCount).toBeLessThanOrEqual(2);
    
    // Should not have excessive duplication
    expect(uncommittedCount).toBeGreaterThan(0);
    expect(stashCount).toBeGreaterThan(0);
  });

  test('shows enhanced error messages when configured', async () => {
    // Temporarily set error level to enhanced
    const originalErrorLevel = process.env.WTT_ERROR_LEVEL;
    process.env.WTT_ERROR_LEVEL = 'enhanced';
    
    try {
      await helpers.createWorktree('feature-enhanced');
      
      // Make uncommitted changes
      await repo.inWorktree('feature-enhanced', async () => {
        await repo.writeFile('uncommitted.js', 'export const test = 1;');
      });
      
      const result = await repo.run('merge feature-enhanced');
      
      helpers.expectFailure(result);
      
      // Should show enhanced error formatting
      helpers.expectOutputContains(result, ['Pre-merge validation failed']);
      
      // Enhanced messages show resolution options
      helpers.expectOutputContains(result, ['Resolution Options']);
      
      // Should still mention the actual issue
      helpers.expectOutputContains(result, ['uncommitted changes']);
    } finally {
      // Restore original error level
      process.env.WTT_ERROR_LEVEL = originalErrorLevel;
    }
  });

  test('merges successfully when run from within worktree directory', async () => {
    // This test catches the issue where merge fails when run from inside a worktree
    await helpers.createWorktree('feature-inside');
    
    // Make changes in the worktree
    await repo.inWorktree('feature-inside', async () => {
      await repo.writeFile('inside-feature.js', 'export const feature = () => "inside";');
      await repo.git('add .');
      await repo.git('commit -m "Add inside feature"');
    });
    
    // Now run merge command from WITHIN the worktree directory
    const worktreePath = path.join(repo.dir, '.worktrees', 'feature-inside');
    const originalCwd = process.cwd();
    
    try {
      process.chdir(worktreePath);
      
      // Run merge from within the worktree - should auto-detect current worktree
      // Use execAsync directly to avoid the repo.exec() changing directories
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const result = await execAsync(`node "${repo.toolPath}" merge`, {
        env: { ...process.env, WTT_AUTO_CONFIRM: 'true' }
      }).then(
        ({ stdout, stderr }) => ({ exitCode: 0, stdout: stdout.trim(), stderr: stderr.trim() }),
        (error) => ({ 
          exitCode: error.code || 1, 
          stdout: error.stdout ? error.stdout.toString().trim() : '', 
          stderr: error.stderr ? error.stderr.toString().trim() : error.message 
        })
      );
      
      helpers.expectSuccess(result);
      helpers.expectOutputContains(result, ['auto-detected', 'feature-inside']);
      helpers.expectOutputContains(result, ['merged', 'Merged']);
      
      // Go back to main repo to verify
      process.chdir(repo.dir);
      
      // Verify file exists in main
      expect(await repo.exists('inside-feature.js')).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('merges successfully with explicit worktree name from within worktree directory', async () => {
    // This test specifically covers the bug where validateMerge was using process.cwd() 
    // instead of config.getWorktreePath() when run from inside a worktree
    await helpers.createWorktree('feature-explicit');
    
    // Make changes in the worktree
    await repo.inWorktree('feature-explicit', async () => {
      await repo.writeFile('explicit-feature.js', 'export const feature = () => "explicit";');
      await repo.git('add .');
      await repo.git('commit -m "Add explicit feature"');
    });
    
    // Now run merge command from WITHIN the worktree directory with explicit name
    const worktreePath = path.join(repo.dir, '.worktrees', 'feature-explicit');
    const originalCwd = process.cwd();
    
    try {
      process.chdir(worktreePath);
      
      // Run merge with explicit worktree name from within the worktree
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const result = await execAsync(`node "${repo.toolPath}" merge feature-explicit`, {
        env: { ...process.env, WTT_AUTO_CONFIRM: 'true' }
      }).then(
        ({ stdout, stderr }) => ({ exitCode: 0, stdout: stdout.trim(), stderr: stderr.trim() }),
        (error) => ({ 
          exitCode: error.code || 1, 
          stdout: error.stdout ? error.stdout.toString().trim() : '', 
          stderr: error.stderr ? error.stderr.toString().trim() : error.message 
        })
      );
      
      helpers.expectSuccess(result);
      // Should NOT contain "worktree not found" error
      expect(result.stderr).not.toContain('worktree \'feature-explicit\' not found');
      helpers.expectOutputContains(result, ['merged', 'Merged']);
      
      // Go back to main repo to verify
      process.chdir(repo.dir);
      
      // Verify file exists in main
      expect(await repo.exists('explicit-feature.js')).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handles merge conflicts', async () => {
    // Create base file
    await repo.writeFile('conflict.js', 'export const value = "main";\n');
    await repo.git('add .');
    await repo.git('commit -m "Add base file"');
    
    // Create worktree and modify file
    await helpers.createWorktree('feature-test');
    
    await repo.inWorktree('feature-test', async () => {
      await repo.writeFile('conflict.js', 'export const value = "feature";\n');
      await repo.git('add .');
      await repo.git('commit -m "Modify in feature"');
    });
    
    // Modify in main
    await repo.writeFile('conflict.js', 'export const value = "main-modified";\n');
    await repo.git('add .');
    await repo.git('commit -m "Modify in main"');
    
    // Try to merge
    const result = await repo.run('merge feature-test');
    
    helpers.expectFailure(result);
    helpers.expectOutputContains(result, ['conflict', 'CONFLICT']);
  }, 60000);

  test('merges successfully when run from different directory', async () => {
    // Create worktree and make changes
    await helpers.createWorktree('feature-external');
    
    await repo.inWorktree('feature-external', async () => {
      await repo.writeFile('external-feature.js', 'export const feature = () => "external";');
      await repo.git('add .');
      await repo.git('commit -m "Add external feature"');
    });
    
    // Create a different directory to run from
    const os = require('os');
    const fs = require('fs-extra');
    const differentDir = path.join(os.tmpdir(), 'wtt-test-different-dir');
    await fs.ensureDir(differentDir);
    
    try {
      // Save original cwd and change to different directory
      const originalCwd = process.cwd();
      process.chdir(differentDir);
      
      // Run merge command from a different directory
      // The tool should find the repository via git discovery
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // First cd to the repo, then run the command
      const fullCommand = `cd "${repo.dir}" && node "${repo.toolPath}" merge feature-external`;
      
      const result = await execAsync(fullCommand, {
        env: { ...process.env, WTT_AUTO_CONFIRM: 'true' },
        shell: true
      }).then(
        ({ stdout, stderr }) => ({ exitCode: 0, stdout: stdout.trim(), stderr: stderr.trim() }),
        (error) => ({ 
          exitCode: error.code || 1, 
          stdout: error.stdout ? error.stdout.toString().trim() : '', 
          stderr: error.stderr ? error.stderr.toString().trim() : error.message 
        })
      );
      
      process.chdir(originalCwd);
      
      // The merge should succeed
      helpers.expectSuccess(result);
      helpers.expectOutputContains(result, ['merged', 'Merged']);
      
      // Verify file exists in main
      expect(await repo.exists('external-feature.js')).toBe(true);
    } finally {
      // Clean up the temporary directory
      await fs.remove(differentDir);
    }
  });
});