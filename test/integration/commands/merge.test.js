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
    
    await repo.inWorktree('wt-feature-test', async () => {
      await repo.writeFile('feature.js', 'export const feature = () => "test";');
      await repo.git('add .');
      await repo.git('commit -m "Add feature"');
    });
    
    // Merge
    const result = await repo.run('merge wt-feature-test');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, ['merged', 'Merged']);
    
    // Verify file exists in main
    expect(await repo.exists('feature.js')).toBe(true);
  });

  test('merges and deletes worktree with --delete flag', async () => {
    await helpers.createWorktree('feature-delete');
    
    // Add a file to the worktree
    await repo.inWorktree('wt-feature-delete', async () => {
      await repo.writeFile('delete-feature.js', 'export const deleteFeature = true;');
      await repo.git('add .');
      await repo.git('commit -m "Add delete feature"');
    });
    
    // Merge with delete flag (auto-confirmed in test environment)
    const result = await repo.run('merge wt-feature-delete --delete');
    helpers.expectSuccess(result);
    
    // Verify file is merged
    expect(await repo.exists('delete-feature.js')).toBe(true);
    
    // Verify worktree is removed
    await AsyncTestHelpers.retry(async () => {
      await helpers.expectWorktreeExists('feature-delete', false);
    });
    
    // Verify ports are released
    const portMap = JSON.parse(await repo.readFile(path.join('.worktrees', '.port-map.json')));
    expect(portMap['wt-feature-delete']).toBeUndefined();
  });

  test('merge without --delete flag preserves worktree', async () => {
    await helpers.createWorktree('feature-preserve');
    
    // Add a file to the worktree
    await repo.inWorktree('wt-feature-preserve', async () => {
      await repo.writeFile('preserve-feature.js', 'export const preserveFeature = true;');
      await repo.git('add .');
      await repo.git('commit -m "Add preserve feature"');
    });
    
    // Merge without delete flag 
    const result = await repo.run('merge wt-feature-preserve');
    helpers.expectSuccess(result);
    
    // Verify file is merged
    expect(await repo.exists('preserve-feature.js')).toBe(true);
    
    // Verify worktree still exists
    await helpers.expectWorktreeExists('feature-preserve', true);
    
    // Verify ports are still assigned
    const portMap = JSON.parse(await repo.readFile(path.join('.worktrees', '.port-map.json')));
    expect(portMap['wt-feature-preserve']).toBeDefined();
  });

  test('fails when worktree has uncommitted changes', async () => {
    await helpers.createWorktree('feature-test');
    
    // Make uncommitted changes
    await repo.inWorktree('wt-feature-test', async () => {
      await repo.writeFile('uncommitted.js', 'export const test = 1;');
    });
    
    const result = await repo.run('merge wt-feature-test');
    
    helpers.expectFailure(result);
    helpers.expectOutputContains(result, ['uncommitted changes', 'commit or stash']);
  });

  test('handles merge conflicts', async () => {
    // Create base file
    await repo.writeFile('conflict.js', 'export const value = "main";\n');
    await repo.git('add .');
    await repo.git('commit -m "Add base file"');
    
    // Create worktree and modify file
    await helpers.createWorktree('feature-test');
    
    await repo.inWorktree('wt-feature-test', async () => {
      await repo.writeFile('conflict.js', 'export const value = "feature";\n');
      await repo.git('add .');
      await repo.git('commit -m "Modify in feature"');
    });
    
    // Modify in main
    await repo.writeFile('conflict.js', 'export const value = "main-modified";\n');
    await repo.git('add .');
    await repo.git('commit -m "Modify in main"');
    
    // Try to merge
    const result = await repo.run('merge wt-feature-test');
    
    helpers.expectFailure(result);
    helpers.expectOutputContains(result, ['conflict', 'CONFLICT']);
  });
});