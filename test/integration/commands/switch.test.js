const { TestRepository } = require('../../helpers/TestRepository');
const path = require('path');

describe('wt switch command', () => {
  let repo;
  
  beforeEach(async () => {
    repo = new TestRepository();
    await repo.init();
    await repo.run('init');
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });

  test('provides cd command for switching to worktree', async () => {
    await repo.run('create feature-test --from main');
    
    const result = await repo.run('switch wt-feature-test');
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('cd ');
    expect(result.stdout).toContain('.worktrees/wt-feature-test');
  });

  test('fails when worktree not found', async () => {
    const result = await repo.run('switch wt-nonexistent');
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not found');
  });

  test('provides absolute path', async () => {
    await repo.run('create feature-test --from main');
    
    const result = await repo.run('switch wt-feature-test');
    
    expect(result.exitCode).toBe(0);
    const expectedPath = path.join(repo.dir, '.worktrees', 'wt-feature-test');
    expect(result.stdout).toContain(expectedPath);
  });
});