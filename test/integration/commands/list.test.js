const { WorktreeTestHelpers } = require('../../helpers/WorktreeTestHelpers');

describe('wt list command', () => {
  let repo, helpers;
  
  beforeEach(async () => {
    ({ repo, helpers } = await WorktreeTestHelpers.setupTestRepo());
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });

  test('shows all worktrees', async () => {
    // Create some worktrees
    await helpers.createWorktree('feature-1');
    await helpers.createWorktree('feature-2');
    
    const result = await repo.run('list');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, 'wt-feature-1');
    helpers.expectOutputContains(result, 'wt-feature-2');
    helpers.expectOutputContains(result, 'feature-1');
    helpers.expectOutputContains(result, 'feature-2');
  });

  test('shows verbose information with -v flag', async () => {
    // Create worktree
    await helpers.createWorktree('feature-test');
    
    // Add a file to make it dirty
    await repo.writeFile('.worktrees/wt-feature-test/new-file.txt', 'content');
    
    const result = await repo.run('list -v');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, 'wt-feature-test');
    helpers.expectOutputContains(result, 'feature-test');
    
    // Should show status - but be flexible about exact text
    helpers.expectOutputContains(result, ['uncommitted', 'dirty', 'modified']);
  });

  test('handles no worktrees gracefully', async () => {
    const result = await repo.run('list');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, ['no worktrees', 'No worktrees found', 'empty']);
  });

  test('shows port assignments', async () => {
    await helpers.createWorktree('feature-test');
    
    const result = await repo.run('list');
    
    helpers.expectSuccess(result);
    // Port display might vary
    helpers.expectOutputContains(result, ['vite', 'storybook']);
    helpers.expectOutputContains(result, [':3', ':6']); // Port numbers
  });
});