const { WorktreeTestHelpers } = require('../../helpers/WorktreeTestHelpers');
const path = require('path');

describe('wt list command', () => {
  let repo, helpers;
  
  beforeEach(async () => {
    ({ repo, helpers } = await WorktreeTestHelpers.setupTestRepo());
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });

  test('shows all worktrees', async () => {
    console.log('[DEBUG] list test - Starting test');
    console.log('[DEBUG] list test - Test repo dir:', repo.dir);
    console.log('[DEBUG] list test - CWD:', process.cwd());
    console.log('[DEBUG] list test - Platform:', process.platform);
    
    // Create some worktrees
    console.log('[DEBUG] list test - Creating worktree feature-1');
    await helpers.createWorktree('feature-1');
    console.log('[DEBUG] list test - Created worktree feature-1');
    
    console.log('[DEBUG] list test - Creating worktree feature-2');
    await helpers.createWorktree('feature-2');
    console.log('[DEBUG] list test - Created worktree feature-2');
    
    // Check what git sees
    const gitListResult = await repo.git('worktree list');
    console.log('[DEBUG] list test - git worktree list output:', gitListResult);
    
    // Check filesystem
    const fs = require('fs');
    const worktreesDir = path.join(repo.dir, '.worktrees');
    if (fs.existsSync(worktreesDir)) {
      const entries = fs.readdirSync(worktreesDir);
      console.log('[DEBUG] list test - .worktrees directory contents:', entries);
      entries.forEach(entry => {
        const fullPath = path.join(worktreesDir, entry);
        const stats = fs.statSync(fullPath);
        console.log(`[DEBUG] list test - ${entry}: isDirectory=${stats.isDirectory()}`);
      });
    } else {
      console.log('[DEBUG] list test - .worktrees directory does not exist!');
    }
    
    console.log('[DEBUG] list test - Running list command');
    const result = await repo.run('list');
    console.log('[DEBUG] list test - List command exit code:', result.exitCode);
    console.log('[DEBUG] list test - List command stdout:', result.stdout);
    console.log('[DEBUG] list test - List command stderr:', result.stderr);
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, 'feature-1');
    helpers.expectOutputContains(result, 'feature-2');
    helpers.expectOutputContains(result, 'feature-1');
    helpers.expectOutputContains(result, 'feature-2');
  });

  test('shows verbose information with -v flag', async () => {
    console.log('[DEBUG] verbose test - Starting test');
    console.log('[DEBUG] verbose test - Test repo dir:', repo.dir);
    
    // Create worktree
    console.log('[DEBUG] verbose test - Creating worktree feature-test');
    await helpers.createWorktree('feature-test');
    
    // Add a file to make it dirty
    const filePath = path.join('.worktrees', 'feature-test', 'new-file.txt');
    console.log('[DEBUG] verbose test - Writing file to:', filePath);
    await repo.writeFile(filePath, 'content');
    
    // Check git status
    const gitListResult = await repo.git('worktree list');
    console.log('[DEBUG] verbose test - git worktree list:', gitListResult);
    
    console.log('[DEBUG] verbose test - Running list -v command');
    const result = await repo.run('list -v');
    console.log('[DEBUG] verbose test - List -v exit code:', result.exitCode);
    console.log('[DEBUG] verbose test - List -v stdout:', result.stdout);
    console.log('[DEBUG] verbose test - List -v stderr:', result.stderr);
    
    helpers.expectSuccess(result);
    helpers.expectOutputContains(result, 'feature-test');
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
    console.log('[DEBUG] ports test - Starting test');
    console.log('[DEBUG] ports test - Test repo dir:', repo.dir);
    
    console.log('[DEBUG] ports test - Creating worktree feature-test');
    await helpers.createWorktree('feature-test');
    
    // Check port map
    const fs = require('fs');
    const portMapPath = path.join(repo.dir, '.worktrees', '.port-map.json');
    if (fs.existsSync(portMapPath)) {
      const portMap = JSON.parse(fs.readFileSync(portMapPath, 'utf8'));
      console.log('[DEBUG] ports test - Port map contents:', JSON.stringify(portMap, null, 2));
    } else {
      console.log('[DEBUG] ports test - No port map file found');
    }
    
    console.log('[DEBUG] ports test - Running list command');
    const result = await repo.run('list');
    console.log('[DEBUG] ports test - List exit code:', result.exitCode);
    console.log('[DEBUG] ports test - List stdout:', result.stdout);
    console.log('[DEBUG] ports test - List stderr:', result.stderr);
    
    helpers.expectSuccess(result);
    // Port display might vary
    helpers.expectOutputContains(result, ['vite', 'storybook']);
    helpers.expectOutputContains(result, [':3', ':6']); // Port numbers
  });
});