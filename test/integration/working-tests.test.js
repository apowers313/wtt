const { TestRepository } = require('../helpers/TestRepository');
const path = require('path');

describe('Git Worktree Tool - Working Tests', () => {
  let repo;
  
  beforeEach(async () => {
    repo = new TestRepository();
    await repo.init();
  }, 30000);
  
  afterEach(async () => {
    await repo.cleanup();
  });

  test('init command works', async () => {
    const result = await repo.run('init');
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Initialized worktree configuration');
    
    // Check files were created
    expect(await repo.exists('.worktree-config.json')).toBe(true);
    expect(await repo.exists('.worktrees')).toBe(true);
  });

  test('create command works with new branch', async () => {
    await repo.run('init');
    
    // Create with --from to specify base branch
    const result = await repo.run('create test-feature --from main');
    
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Worktree created');
    expect(result.stdout).toContain('Assigned ports');
    
    // Check worktree exists
    expect(await repo.exists(path.join('.worktrees', 'wt-test-feature'))).toBe(true);
  });

  test('list command shows worktrees', async () => {
    await repo.run('init');
    await repo.run('create feature-1 --from main');
    await repo.run('create feature-2 --from main');
    
    const result = await repo.run('list');
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('wt-feature-1');
    expect(result.stdout).toContain('wt-feature-2');
  });

  test('ports command shows port assignments', async () => {
    await repo.run('init');
    await repo.run('create test-feature --from main');
    
    const result = await repo.run('ports');
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('wt-test-feature');
    expect(result.stdout).toContain('vite:');
  });

  test('switch command returns path', async () => {
    await repo.run('init');
    await repo.run('create test-feature --from main');
    
    const result = await repo.run('switch wt-test-feature');
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('cd ');
    expect(result.stdout).toContain(path.join('.worktrees', 'wt-test-feature'));
  });

  test('remove command with force flag', async () => {
    await repo.run('init');
    await repo.run('create test-feature --from main');
    
    const result = await repo.run('remove wt-test-feature --force');
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Removed worktree');
    
    // Verify worktree is gone
    expect(await repo.exists(path.join('.worktrees', 'wt-test-feature'))).toBe(false);
  });
});