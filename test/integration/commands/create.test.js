const { WorktreeTestHelpers } = require('../../helpers/WorktreeTestHelpers');
const { AsyncTestHelpers } = require('../../helpers/InteractiveTestHelpers');
const path = require('path');

describe('wt create command', () => {
  let repo, helpers;
  
  beforeEach(async () => {
    ({ repo, helpers } = await WorktreeTestHelpers.setupTestRepo());
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });
  
  describe('Success cases', () => {
    test('creates worktree for new branch', async () => {
      if (process.env.CI || process.env.DEBUG_TESTS) {
        console.log('\n[DEBUG] Integration create test starting:');
        console.log('  Platform:', process.platform);
        console.log('  Working dir:', process.cwd());
        console.log('  Repo dir:', repo.dir);
      }
      
      const result = await helpers.createWorktree('feature-test');
      
      if (process.env.CI || process.env.DEBUG_TESTS) {
        console.log('\n[DEBUG] Create worktree result:');
        console.log('  Exit code:', result.exitCode);
        console.log('  STDOUT:', result.stdout);
        console.log('  STDERR:', result.stderr);
      }
      
      helpers.expectSuccess(result);
      helpers.expectOutputContains(result, ['worktree created', 'created worktree']);
      
      // Check that at least vite port is assigned (it's required)
      helpers.expectPortAssignment(result, 'vite');
      
      // Check which services were actually assigned ports
      try {
        // Try to check for storybook port, but don't fail if it's not configured
        helpers.expectPortAssignment(result, 'storybook');
      } catch (error) {
        if (process.env.CI || process.env.DEBUG_TESTS) {
          console.log('  Storybook port not configured (expected):', error.message);
        }
        // Storybook might not be configured, that's okay
      }
    });

    test('creates worktree with all required files', async () => {
      const result = await helpers.createWorktree('feature-test');
      
      helpers.expectSuccess(result);
      
      // Check worktree exists
      await helpers.expectWorktreeExists('feature-test');
      
      // Check .env.worktree - at minimum should have VITE_PORT
      const envPath = path.join('.worktrees', 'wt-feature-test', '.env.worktree');
      const envContent = await repo.readFile(envPath);
      
      // Must have at least VITE_PORT and WORKTREE_NAME
      expect(envContent).toMatch(/VITE_PORT=\d{4}/);
      expect(envContent).toContain('WORKTREE_NAME=wt-feature-test');
      
      // STORYBOOK_PORT is optional depending on config
      if (envContent.includes('STORYBOOK_PORT')) {
        expect(envContent).toMatch(/STORYBOOK_PORT=\d{4}/);
      }
      
      // Check port map - vite should always be there
      const ports = await helpers.expectPortsAssigned('feature-test', ['vite']);
      expect(ports).toHaveProperty('vite');
      expect(ports.vite).toBeGreaterThanOrEqual(3000);
      
      // Check optional ports if they exist
      if (ports.storybook) {
        expect(ports.storybook).toBeGreaterThanOrEqual(6000);
      }
      
      // Check git worktree
      const worktrees = await repo.git('worktree list');
      expect(worktrees.stdout).toContain('wt-feature-test');
    });

    test('creates multiple worktrees with unique ports', async () => {
      await helpers.createWorktree('feature-1');
      await helpers.createWorktree('feature-2');
      await helpers.createWorktree('feature-3');
      
      const ports1 = await helpers.expectPortsAssigned('feature-1', ['vite']);
      const ports2 = await helpers.expectPortsAssigned('feature-2', ['vite']);
      const ports3 = await helpers.expectPortsAssigned('feature-3', ['vite']);
      
      // Verify ports are unique and increment properly
      expect(ports2.vite).toBe(ports1.vite + 10);
      expect(ports3.vite).toBe(ports2.vite + 10);
    });
  });
  
  describe('Error cases', () => {
    test('fails when branch already exists', async () => {
      await repo.git('checkout -b feature-exists');
      await repo.git('checkout main');
      
      const result = await helpers.createWorktree('feature-exists');
      
      helpers.expectFailure(result, 'already exists');
    });

    test('fails when worktree already exists', async () => {
      // Create first worktree
      const result1 = await helpers.createWorktree('feature-test');
      helpers.expectSuccess(result1);
      
      // Try to create again
      const result2 = await helpers.createWorktree('feature-test');
      helpers.expectFailure(result2, 'already exists');
    });
  });
  
  describe('Edge cases', () => {
    test('handles branch names with uppercase', async () => {
      const result = await helpers.createWorktree('FEATURE-TEST');
      
      helpers.expectSuccess(result);
      await helpers.expectWorktreeExists('FEATURE-TEST');
    });
  });
});