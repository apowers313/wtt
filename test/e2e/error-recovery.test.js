const { WorktreeTestHelpers } = require('../helpers/WorktreeTestHelpers');
const { InteractiveTestHelpers, AsyncTestHelpers } = require('../helpers/InteractiveTestHelpers');
const fsExtra = require('fs-extra');
const path = require('path');

describe('Error recovery scenarios', () => {
  let repo, helpers;
  
  beforeAll(() => {
    InteractiveTestHelpers.setupMocks();
  });
  
  beforeEach(async () => {
    ({ repo, helpers } = await WorktreeTestHelpers.setupTestRepo());
  });
  
  afterEach(async () => {
    jest.dontMock('inquirer');
    await repo.cleanup();
  });

  test('recovers from interrupted worktree creation', async () => {
    // Simulate partial worktree creation - create git worktree but not our tracking
    await repo.git('checkout -b broken-branch');
    await repo.git('checkout main');
    await repo.git(`worktree add ${path.join('.worktrees', 'wt-broken')} broken-branch`);
    
    // Try to create same worktree again through our tool
    const result = await helpers.createWorktree('broken');
    
    // Should detect existing worktree
    helpers.expectFailure(result, 'already exists');
    
    // Clean up broken worktree
    jest.doMock('inquirer', () => 
      InteractiveTestHelpers.mockInquirer({ confirmFinal: true })
    );
    
    const removeResult = await repo.run('remove wt-broken --force');
    helpers.expectSuccess(removeResult);
  });

  test('handles corrupted port map', async () => {
    // Create invalid port map
    await repo.writeFile(path.join('.worktrees', '.port-map.json'), 'invalid json{');
    
    // Try to create worktree - implementation might recover or fail
    const result = await helpers.createWorktree('feature-test');
    
    if (result.exitCode === 0) {
      // Recovered successfully
      await helpers.expectWorktreeExists('feature-test');
      
      // Port map should be valid now
      const portMap = JSON.parse(await repo.readFile(path.join('.worktrees', '.port-map.json')));
      expect(portMap['wt-feature-test']).toBeDefined();
    } else {
      // Failed with error about corruption
      helpers.expectOutputContains(result, ['json', 'parse', 'invalid']);
    }
  });

  test('handles missing .worktrees directory', async () => {
    // Remove .worktrees directory after init
    await fsExtra.remove(path.join(repo.dir, '.worktrees'));
    
    // Create worktree - should recreate directory
    const result = await helpers.createWorktree('feature-test');
    
    // Most implementations should recover
    if (result.exitCode === 0) {
      helpers.expectSuccess(result);
      await helpers.expectWorktreeExists('feature-test');
    } else {
      // Or fail with clear message
      helpers.expectOutputContains(result, ['directory', '.worktrees']);
    }
  });

  test('handles port conflicts', async () => {
    // Create first worktree
    await helpers.createWorktree('feature-1');
    
    // Get assigned ports
    const portMap1 = JSON.parse(await repo.readFile(path.join('.worktrees', '.port-map.json')));
    const vitePort1 = portMap1['wt-feature-1'].vite;
    
    // Manually add fake entry with same port
    portMap1['wt-fake'] = {
      vite: vitePort1,
      storybook: 6006,
      custom: 8000,
      created: new Date().toISOString()
    };
    await repo.writeFile(path.join('.worktrees', '.port-map.json'), JSON.stringify(portMap1, null, 2));
    
    // Create another worktree - should get different port
    const result = await helpers.createWorktree('feature-2');
    helpers.expectSuccess(result);
    
    // Verify unique port assigned
    const finalPortMap = JSON.parse(await repo.readFile(path.join('.worktrees', '.port-map.json')));
    expect(finalPortMap['wt-feature-2'].vite).not.toBe(vitePort1);
  });

  test('recovers from git worktree inconsistency', async () => {
    // Create worktree
    await helpers.createWorktree('feature-test');
    
    // Manually remove git worktree but leave our tracking
    await repo.git(`worktree remove ${path.join('.worktrees', 'wt-feature-test')} --force`);
    
    // Try to remove via wt command
    const result = await repo.run('remove wt-feature-test --force');
    
    // Should handle gracefully
    helpers.expectSuccess(result);
    
    // Verify cleanup
    await AsyncTestHelpers.retry(async () => {
      const portMap = JSON.parse(await repo.readFile(path.join('.worktrees', '.port-map.json')));
      expect(portMap['wt-feature-test']).toBeUndefined();
    });
  });

  test('handles workspace with uncommitted changes during merge', async () => {
    // Create worktree and make changes
    await helpers.createWorktree('feature-test');
    
    await repo.inWorktree('wt-feature-test', async () => {
      await repo.writeFile('feature.js', 'export const feature = () => {};');
      await repo.git('add .');
      await repo.git('commit -m "Add feature"');
      
      // Add uncommitted changes
      await repo.writeFile('uncommitted.js', 'export const test = 1;');
    });
    
    // Try to merge
    const mergeResult = await repo.run('merge wt-feature-test');
    
    helpers.expectFailure(mergeResult);
    helpers.expectOutputContains(mergeResult, ['uncommitted changes', 'commit', 'stash']);
    
    // Clean up worktree
    jest.doMock('inquirer', () => 
      InteractiveTestHelpers.mockInquirer({ 
        confirmWithChanges: true,
        confirmFinal: true 
      })
    );
    await repo.run('remove wt-feature-test --force');
  });

  test('handles non-existent base branch', async () => {
    const result = await repo.run('create feature-test --from nonexistent-branch');
    
    helpers.expectFailure(result);
    helpers.expectOutputContains(result, ['nonexistent', 'not found', 'does not exist']);
  });

  test('handles worktree name collisions', async () => {
    // Create worktree
    await helpers.createWorktree('test');
    
    // Try to create another with same name
    const result = await helpers.createWorktree('test');
    
    helpers.expectFailure(result);
    helpers.expectOutputContains(result, ['already exists', 'exists']);
  });

  test('handles cleanup after failed operations', async () => {
    // Create a worktree
    await helpers.createWorktree('cleanup-test');
    
    // Simulate a failed operation by corrupting the worktree
    const worktreePath = path.join('.worktrees', 'wt-cleanup-test');
    await repo.writeFile(`${worktreePath}/.git`, 'corrupted');
    
    // Try to remove - should handle corrupted state
    const result = await repo.run('remove wt-cleanup-test --force');
    
    // Should succeed or give clear error
    if (result.exitCode === 0) {
      helpers.expectSuccess(result);
      // Verify cleanup
      await helpers.expectWorktreeExists('cleanup-test', false);
    } else {
      helpers.expectOutputContains(result, ['corrupt', 'broken', 'invalid', 'validation failed', 'not a .git file']);
    }
  });
});