const { WorktreeTestHelpers } = require('../../helpers/WorktreeTestHelpers');
const { AsyncTestHelpers } = require('../../helpers/InteractiveTestHelpers');
const path = require('path');

describe('wt remove command (simplified)', () => {
  let repo, helpers;
  
  beforeEach(async () => {
    ({ repo, helpers } = await WorktreeTestHelpers.setupTestRepo());
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });

  test('removes worktree with --force flag', async () => {
    await helpers.createWorktree('feature-test');
    
    // Force flag bypasses all prompts
    const result = await repo.run('remove feature-test --force');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, ['removed worktree', 'Removed worktree', 'Cleaned up worktree directory']);
    
    // Verify worktree is removed
    await AsyncTestHelpers.retry(async () => {
      await helpers.expectWorktreeExists('feature-test', false);
    });
  });

  test('fails when worktree does not exist', async () => {
    const result = await repo.run('remove nonexistent --force');
    
    helpers.expectFailure(result);
    helpers.expectOutputContains(result, ['not found', 'does not exist', 'doesn\'t exist']);
  });

  test('removes worktree with uncommitted changes when forced', async () => {
    await helpers.createWorktree('feature-test');
    
    // Add uncommitted changes
    const worktreePath = path.join('.worktrees', helpers.getWorktreeName('feature-test'));
    await repo.writeFile(path.join(worktreePath, 'uncommitted.js'), 'export const test = 1;');
    
    const result = await repo.run('remove feature-test --force');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, ['removed worktree', 'Removed worktree', 'Cleaned up worktree directory']);
    
    // Verify worktree is removed
    await AsyncTestHelpers.retry(async () => {
      await helpers.expectWorktreeExists('feature-test', false);
    });
  });
});