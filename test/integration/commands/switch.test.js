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
    
    if (process.env.CI || process.env.DEBUG_TESTS) {
      console.log('\n[DEBUG] switch test:');
      console.log('  Platform:', process.platform);
      console.log('  Exit code:', result.exitCode);
      console.log('  STDOUT:', result.stdout);
      console.log('  STDERR:', result.stderr);
      console.log('  Expected path component:', path.join('.worktrees', 'wt-feature-test'));
      
      if (process.platform === 'win32') {
        console.log('  Windows path separators in stdout:', result.stdout.includes('\\'));
        console.log('  POSIX path separators in stdout:', result.stdout.includes('/'));
        console.log('  Raw stdout bytes:', Buffer.from(result.stdout).toString('hex'));
      }
    }
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('cd ');
    
    // Handle platform-specific path separators
    const expectedPath = path.join('.worktrees', 'wt-feature-test');
    const pathInOutput = result.stdout.includes(expectedPath) || 
                        result.stdout.includes(expectedPath.replace(/\\/g, '/')) ||
                        result.stdout.includes(expectedPath.replace(/\//g, '\\'));
    
    expect(pathInOutput).toBe(true);
  });

  test('fails when worktree not found', async () => {
    const result = await repo.run('switch wt-nonexistent');
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not found');
  });

  test('provides absolute path', async () => {
    await repo.run('create feature-test --from main');
    
    const result = await repo.run('switch wt-feature-test');
    
    const expectedPath = path.join(repo.dir, '.worktrees', 'wt-feature-test');
    
    if (process.env.CI || process.env.DEBUG_TESTS) {
      console.log('\n[DEBUG] absolute path test:');
      console.log('  Platform:', process.platform);
      console.log('  Exit code:', result.exitCode);
      console.log('  Expected path:', expectedPath);
      console.log('  STDOUT contains expected:', result.stdout.includes(expectedPath));
      console.log('  Full STDOUT:', result.stdout);
      console.log('  Full STDERR:', result.stderr);
      
      if (process.platform === 'win32') {
        console.log('  Expected path normalized:', expectedPath.replace(/\\/g, '/'));
        console.log('  STDOUT normalized contains expected:', 
          result.stdout.replace(/\\/g, '/').includes(expectedPath.replace(/\\/g, '/')));
      }
    }
    
    expect(result.exitCode).toBe(0);
    
    // Handle platform-specific path formats
    const pathInOutput = result.stdout.includes(expectedPath) ||
                        result.stdout.includes(expectedPath.replace(/\\/g, '/')) ||
                        result.stdout.includes(expectedPath.replace(/\//g, '\\'));
    
    expect(pathInOutput).toBe(true);
  });
});