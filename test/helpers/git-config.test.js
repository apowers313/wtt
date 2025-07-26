/**
 * Tests to verify git configuration isolation
 */

const { TestRepository } = require('./TestRepository');
const GitConfigHelper = require('./git-config-helper');
const path = require('path');

describe('Git configuration isolation', () => {
  let repo;

  beforeEach(async () => {
    repo = new TestRepository();
    await repo.init();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  test('git commits work without GPG signing', async () => {
    // This should work even if user has global gpgsign=true
    await repo.writeFile('test.txt', 'test content');
    await repo.git('add test.txt');
    
    const result = await repo.git('commit -m "Test commit without signing"');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Test commit without signing');
    
    // Verify the commit was created
    const log = await repo.git('log --oneline -1');
    expect(log.stdout).toContain('Test commit without signing');
  });

  test('git config is isolated from global settings', async () => {
    // Check that commit.gpgsign is false in test repo
    const gpgSign = await repo.git('config --get commit.gpgsign');
    // Config value might be empty if not set, but signing should not be required
    expect(gpgSign.stdout === 'false' || gpgSign.stdout === '').toBe(true);
    
    // Check user is set to test values
    const userName = await repo.git('config --get user.name');
    expect(userName.stdout).toBe('Test User');
    
    const userEmail = await repo.git('config --get user.email');
    expect(userEmail.stdout).toBe('test@example.com');
  });

  test('environment variables prevent global config interference', async () => {
    // Verify critical environment variables are set
    const result = await repo.exec('echo $GIT_CONFIG_NOSYSTEM');
    expect(result.stdout).toBe('1');
    
    // HOME should be set to test directory
    const homeResult = await repo.exec('echo $HOME');
    expect(homeResult.stdout).toBe(repo.dir);
  });

  test('git operations use consistent configuration', async () => {
    // Create multiple commits
    for (let i = 1; i <= 3; i++) {
      await repo.writeFile(`file${i}.txt`, `content ${i}`);
      await repo.git(`add file${i}.txt`);
      await repo.git(`commit -m "Commit ${i}"`);
    }
    
    // Check all commits have consistent author
    const log = await repo.git('log --format="%an <%ae>" -3');
    const lines = log.stdout.split('\n').filter(l => l);
    
    expect(lines).toHaveLength(3);
    lines.forEach(line => {
      expect(line).toBe('Test User <test@example.com>');
    });
  });

  test('verify test config helper', async () => {
    const verification = await GitConfigHelper.verifyTestConfig(repo.git.bind(repo));
    
    expect(verification.isValid).toBe(true);
    expect(verification.issues).toHaveLength(0);
  });

  test('tags work without GPG signing', async () => {
    // Create a tag without signing
    const result = await repo.git('tag -a v1.0.0 -m "Test tag"');
    expect(result.exitCode).toBe(0);
    
    // Verify tag was created
    const tags = await repo.git('tag -l');
    expect(tags.stdout).toContain('v1.0.0');
  });

  test('merge commits work with configured behavior', async () => {
    // Create a branch with changes
    await repo.git('checkout -b feature');
    await repo.writeFile('feature.txt', 'feature content');
    await repo.git('add feature.txt');
    await repo.git('commit -m "Add feature"');
    
    // Merge back to main
    await repo.git('checkout main');
    const mergeResult = await repo.git('merge feature --no-ff');
    
    expect(mergeResult.exitCode).toBe(0);
    
    // Verify merge commit was created (due to merge.ff=false in test config)
    const log = await repo.git('log --oneline -1');
    expect(log.stdout).toMatch(/Merge branch 'feature'/);
  });
});

describe('Git config helper utilities', () => {
  test('getTestEnvironment returns correct variables', () => {
    const env = GitConfigHelper.getTestEnvironment('/test/dir');
    
    expect(env.GIT_CONFIG_NOSYSTEM).toBe('1');
    expect(env.HOME).toBe('/test/dir');
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.GPG_TTY).toBe('');
    expect(env.GIT_AUTHOR_NAME).toBe('Test User');
    expect(env.GIT_COMMITTER_EMAIL).toBe('test@example.com');
  });

  test('createMinimalConfig creates valid config file', async () => {
    const fs = require('fs-extra');
    const os = require('os');
    const configPath = path.join(os.tmpdir(), `test-git-config-${Date.now()}`);
    
    try {
      await GitConfigHelper.createMinimalConfig(configPath);
      
      const content = await fs.readFile(configPath, 'utf8');
      expect(content).toContain('[user]');
      expect(content).toContain('gpgsign = false');
      expect(content).toContain('email = test@example.com');
    } finally {
      await fs.remove(configPath);
    }
  });
});