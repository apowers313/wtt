const { TestRepository } = require('../helpers/TestRepository');
const { mockInquirer } = require('../helpers/mocks');

describe('Complete feature development workflow', () => {
  let repo;
  
  beforeEach(async () => {
    repo = new TestRepository();
    await repo.init();
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });
  
  test('develop and merge a feature', async () => {
    // Initialize wt
    await repo.run('init');
    
    // Create feature branch
    const createResult = await repo.run('create feature-awesome --from main');
    expect(createResult.exitCode).toBe(0);
    
    // Work in the worktree
    await repo.inWorktree('wt-feature-awesome', async () => {
      // Create feature files
      await repo.writeFile('src/awesome.js', 'export const awesome = () => "awesome";');
      await repo.git('add .');
      await repo.git('commit -m "Add awesome feature"');
    });
    
    // List worktrees
    const listResult = await repo.run('list');
    expect(listResult.stdout).toContain('wt-feature-awesome');
    
    // Check ports
    const portsResult = await repo.run('ports wt-feature-awesome');
    expect(portsResult.stdout).toContain('vite: 3000');
    
    // Mock inquirer for merge confirmation
    jest.doMock('inquirer', () => mockInquirer({ confirmDelete: true }));
    
    // Merge back to main
    const mergeResult = await repo.run('merge wt-feature-awesome --delete');
    expect(mergeResult.exitCode).toBe(0);
    
    // Verify we're on main
    const branch = await repo.currentBranch();
    expect(branch).toBe('main');
    
    // Verify feature is merged
    expect(await repo.exists('src/awesome.js')).toBe(true);
    
    // Verify worktree is removed
    expect(await repo.exists('.worktrees/wt-feature-awesome')).toBe(false);
    
    // Verify ports are released
    const portMap = JSON.parse(await repo.readFile('.worktrees/.port-map.json'));
    expect(portMap['wt-feature-awesome']).toBeUndefined();
    
    jest.unmock('inquirer');
  });

  test('parallel feature development', async () => {
    // Initialize
    await repo.run('init');
    
    // Create multiple feature branches
    await repo.run('create feature-ui --from main');
    await repo.run('create feature-api --from main');
    await repo.run('create feature-auth --from main');
    
    // Work on features in parallel
    await repo.inWorktree('wt-feature-ui', async () => {
      await repo.writeFile('src/ui.js', 'export const ui = () => "UI";');
      await repo.git('add .');
      await repo.git('commit -m "Add UI feature"');
    });
    
    await repo.inWorktree('wt-feature-api', async () => {
      await repo.writeFile('src/api.js', 'export const api = () => "API";');
      await repo.git('add .');
      await repo.git('commit -m "Add API feature"');
    });
    
    await repo.inWorktree('wt-feature-auth', async () => {
      await repo.writeFile('src/auth.js', 'export const auth = () => "Auth";');
      await repo.git('add .');
      await repo.git('commit -m "Add Auth feature"');
    });
    
    // List all worktrees
    const listResult = await repo.run('list -v');
    expect(listResult.stdout).toContain('wt-feature-ui');
    expect(listResult.stdout).toContain('wt-feature-api');
    expect(listResult.stdout).toContain('wt-feature-auth');
    expect(listResult.stdout.toLowerCase()).toContain('clean');
    
    // Check port assignments
    const portMap = JSON.parse(await repo.readFile('.worktrees/.port-map.json'));
    expect(portMap['wt-feature-ui'].vite).toBe(3000);
    expect(portMap['wt-feature-api'].vite).toBe(3010);
    expect(portMap['wt-feature-auth'].vite).toBe(3020);
    
    // Merge features one by one
    jest.doMock('inquirer', () => mockInquirer({ confirmDelete: true }));
    
    await repo.run('merge wt-feature-ui --delete');
    await repo.run('merge wt-feature-api --delete');
    await repo.run('merge wt-feature-auth --delete');
    
    // Verify all features are merged
    expect(await repo.exists('src/ui.js')).toBe(true);
    expect(await repo.exists('src/api.js')).toBe(true);
    expect(await repo.exists('src/auth.js')).toBe(true);
    
    // Verify all worktrees are removed
    const finalListResult = await repo.run('list');
    expect(finalListResult.stdout).toContain('No worktrees found');
    
    jest.unmock('inquirer');
  });

  test('feature development with conflicts', async () => {
    await repo.run('init');
    
    // Create base file
    await repo.writeFile('src/config.js', 'export const config = { version: "1.0.0" };');
    await repo.git('add .');
    await repo.git('commit -m "Add base config"');
    
    // Create two features that will conflict
    const create1 = await repo.run('create feature-update-version --from main');
    const create2 = await repo.run('create feature-add-settings --from main');
    
    // Update version in first feature
    await repo.inWorktree('wt-feature-update-version', async () => {
      await repo.writeFile('src/config.js', 'export const config = { version: "2.0.0" };');
      await repo.git('add .');
      await repo.git('commit -m "Update version to 2.0.0"');
    });
    
    // Add settings in second feature
    await repo.inWorktree('wt-feature-add-settings', async () => {
      await repo.writeFile('src/config.js', 'export const config = { version: "1.0.0", settings: {} };');
      await repo.git('add .');
      await repo.git('commit -m "Add settings object"');
    });
    
    // Merge first feature
    const merge1Result = await repo.run('merge wt-feature-update-version');
    expect(merge1Result.exitCode).toBe(0);
    
    // Try to merge second feature (will conflict)
    const merge2Result = await repo.run('merge wt-feature-add-settings');
    expect(merge2Result.exitCode).toBe(1);
    expect(merge2Result.stderr.toLowerCase()).toContain('conflict');
    
    // Clean up
    jest.doMock('inquirer', () => mockInquirer({ confirmFinal: true }));
    await repo.run('remove wt-feature-update-version --force');
    await repo.run('remove wt-feature-add-settings --force');
    jest.unmock('inquirer');
  });
});