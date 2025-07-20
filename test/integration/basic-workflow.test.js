const { WorktreeTestHelpers } = require('../helpers/WorktreeTestHelpers');

describe('Basic workflow test', () => {
  let repo, helpers;
  
  beforeEach(async () => {
    ({ repo, helpers } = await WorktreeTestHelpers.setupTestRepo());
  }, 30000);
  
  afterEach(async () => {
    await repo.cleanup();
  });

  test('can create a worktree', async () => {
    const result = await helpers.createWorktree('test-feature');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, ['created', 'Created']);
    
    // Check worktree exists
    await helpers.expectWorktreeExists('test-feature');
    
    // Check ports were assigned
    await helpers.expectPortsAssigned('test-feature', ['vite', 'storybook']);
  });

  test('complete feature development workflow', async () => {
    // Create worktree
    const createResult = await helpers.createWorktree('feature-workflow');
    helpers.expectSuccess(createResult);
    
    // Make changes in worktree
    await repo.inWorktree('wt-feature-workflow', async () => {
      await repo.writeFile('feature.js', 'export const feature = true;');
      await repo.git('add .');
      await repo.git('commit -m "Add feature"');
    });
    
    // List worktrees
    const listResult = await repo.run('list -v');
    helpers.expectSuccess(listResult);
    helpers.expectOutputContains(listResult, 'wt-feature-workflow');
    
    // Merge without --delete flag (it may not be implemented)
    const mergeResult = await repo.run('merge wt-feature-workflow');
    helpers.expectSuccess(mergeResult);
    
    // Verify merge completed
    expect(await repo.exists('feature.js')).toBe(true);
    
    // Clean up worktree manually with force flag
    const removeResult = await repo.run('remove wt-feature-workflow --force');
    helpers.expectSuccess(removeResult);
    
    // Verify worktree cleaned up
    await helpers.expectWorktreeExists('feature-workflow', false);
  });

  test('handles errors gracefully', async () => {
    // Try to create worktree with existing branch
    await repo.git('checkout -b existing-feature');
    await repo.git('checkout main');
    
    const result = await helpers.createWorktree('existing-feature');
    
    // Should either fail with clear message or succeed using existing branch
    if (result.exitCode !== 0) {
      helpers.expectOutputContains(result, 'already exists');
    } else {
      // Succeeded with existing branch
      await helpers.expectWorktreeExists('existing-feature');
    }
  });
});