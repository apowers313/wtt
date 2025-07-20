const { WorktreeTestHelpers } = require('../../helpers/WorktreeTestHelpers');
const { AsyncTestHelpers } = require('../../helpers/InteractiveTestHelpers');
const path = require('path');
const fsExtra = require('fs-extra');

// We'll use manual testing approach for interactive commands
// since mocking inquirer is complex with the current architecture

describe('wt remove command (fixed)', () => {
  let repo, helpers;
  
  beforeEach(async () => {
    ({ repo, helpers } = await WorktreeTestHelpers.setupTestRepo());
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });

  // Non-interactive tests that don't require mocking
  
  test('removes worktree with --force flag', async () => {
    await helpers.createWorktree('feature-test');
    
    // Make uncommitted changes
    const worktreePath = path.join('.worktrees', helpers.getWorktreeName('feature-test'));
    await repo.writeFile(path.join(worktreePath, 'uncommitted.js'), 'export const test = 1;');
    
    // Force remove bypasses all prompts
    const result = await repo.run('remove wt-feature-test --force');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, ['removed worktree', 'Removed worktree']);
    
    // Verify worktree is removed
    await AsyncTestHelpers.retry(async () => {
      await helpers.expectWorktreeExists('feature-test', false);
    });
    
    // Verify ports released
    const portMap = JSON.parse(await repo.readFile(path.join('.worktrees', '.port-map.json')));
    expect(portMap['wt-feature-test']).toBeUndefined();
  });

  test('fails when worktree does not exist', async () => {
    const result = await repo.run('remove wt-nonexistent');
    
    helpers.expectFailure(result);
    helpers.expectOutputContains(result, ['not found', 'does not exist']);
  });

  test('handles broken worktree gracefully', async () => {
    // Create worktree
    await helpers.createWorktree('feature-test');
    
    // Manually remove worktree directory (simulating corruption)
    await fsExtra.remove(path.join(repo.dir, '.worktrees', 'wt-feature-test'));
    
    // Try to remove with --force
    const result = await repo.run('remove wt-feature-test --force');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, ['removed', 'Removed']);
    
    // Verify cleanup
    const portMap = JSON.parse(await repo.readFile(path.join('.worktrees', '.port-map.json')));
    expect(portMap['wt-feature-test']).toBeUndefined();
  });

  test('releases ports when removing worktree', async () => {
    await helpers.createWorktree('feature-test');
    
    // Verify ports assigned
    const portsBefore = await helpers.expectPortsAssigned('feature-test', ['vite', 'storybook']);
    expect(portsBefore.vite).toBeGreaterThanOrEqual(3000);
    
    // Remove with force
    const result = await repo.run('remove wt-feature-test --force');
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, 'Released ports');
    
    // Verify ports released
    const portMap = JSON.parse(await repo.readFile(path.join('.worktrees', '.port-map.json')));
    expect(portMap['wt-feature-test']).toBeUndefined();
  });

  test('shows note about branch after removal', async () => {
    await helpers.createWorktree('feature-test');
    
    const result = await repo.run('remove wt-feature-test --force');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, ['branch', 'still exists', 'git branch -d']);
  });
});

describe('wt remove command - interactive behavior documentation', () => {
  // These tests document the expected interactive behavior
  // They would need actual user input or a different testing approach
  
  // Interactive test coverage is provided in remove-simple.test.js


});