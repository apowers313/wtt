const { TestRepository } = require('../../helpers/TestRepository');

describe('wt ports command', () => {
  let repo;
  
  beforeEach(async () => {
    repo = new TestRepository();
    await repo.init();
    await repo.run('init');
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });

  test('shows ports for specific worktree', async () => {
    await repo.run('create feature-test --from main');
    
    const result = await repo.run('ports feature-test');
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('feature-test');
    expect(result.stdout).toContain('vite: 3000');
    expect(result.stdout).toContain('storybook: 6006');
    expect(result.stdout).toContain('custom: 8000');
  });

  test('shows all port assignments when no worktree specified', async () => {
    await repo.run('create feature-1 --from main');
    await repo.run('create feature-2 --from main');
    
    const result = await repo.run('ports');
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('feature-1');
    expect(result.stdout).toContain('vite: 3000');
    expect(result.stdout).toContain('feature-2');
    expect(result.stdout).toContain('vite: 3010');
  });


  test('shows message when no ports assigned', async () => {
    const result = await repo.run('ports');
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No port assignments found');
  });

  test('shows message when worktree has no ports', async () => {
    const result = await repo.run('ports nonexistent');
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No ports assigned to worktree');
  });
});