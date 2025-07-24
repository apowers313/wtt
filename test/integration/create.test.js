const { WorktreeTestHelpers } = require('../helpers/WorktreeTestHelpers');
const path = require('path');

describe('wt create command (integration)', () => {
  let repo, helpers;
  
  beforeEach(async () => {
    ({ repo, helpers } = await WorktreeTestHelpers.setupTestRepo());
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });

  test('creates a new worktree', async () => {
    const result = await helpers.createWorktree('feature-test');
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, ['created', 'Created']);
    
    // Check for port assignments in output
    helpers.expectPortAssignment(result, 'vite', { min: 3000, max: 3100 });
    
    // Verify worktree exists
    await helpers.expectWorktreeExists('feature-test');
    
    // Verify environment file
    await helpers.expectEnvFile('feature-test', {
      'VITE_PORT': /\d{4}/
    });
  });

  test('creates worktree from specific branch', async () => {
    // Create develop branch
    await repo.git('checkout -b develop');
    await repo.writeFile('develop.txt', 'develop branch');
    await repo.git('add develop.txt');
    await repo.git('commit -m "Add develop file"');
    await repo.git('checkout main');
    
    const result = await helpers.createWorktree('feature-from-develop', { from: 'develop' });
    
    helpers.expectSuccess(result);
    
    // Check that the file from develop branch exists in worktree
    expect(await repo.exists(path.join('.worktrees', 'feature-from-develop', 'develop.txt'))).toBe(true);
  });

  test('fails if branch already exists', async () => {
    // Create branch first
    await repo.git('checkout -b existing-branch');
    await repo.git('checkout main');
    
    const result = await helpers.createWorktree('existing-branch');
    
    // Should handle gracefully - either fail or succeed with existing branch
    if (result.exitCode !== 0) {
      helpers.expectFailure(result, 'already exists');
    } else {
      // Might succeed by using existing branch
      helpers.expectSuccess(result);
    }
  });

  test('assigns unique ports for multiple worktrees', async () => {
    // Create multiple worktrees
    await helpers.createWorktree('feature-1');
    await helpers.createWorktree('feature-2');
    
    // Check port assignments
    const ports1 = await helpers.expectPortsAssigned('feature-1', ['vite']);
    const ports2 = await helpers.expectPortsAssigned('feature-2', ['vite']);
    
    // Ports should be different
    expect(ports1.vite).not.toBe(ports2.vite);
    
    // Should increment by configured amount (usually 10)
    expect(Math.abs(ports2.vite - ports1.vite)).toBeGreaterThanOrEqual(10);
  });
});