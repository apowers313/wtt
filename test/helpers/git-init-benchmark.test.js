/**
 * Benchmark to compare git initialization methods
 * Run with: npm test test/helpers/git-init-benchmark.test.js
 */

const { TestRepository } = require('./TestRepository');
const gitTemplateCache = require('./git-template-cache');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('Git initialization performance', () => {
  const iterations = 10;

  test('benchmark: old method vs template method', async () => {
    console.log(`\nRunning benchmark with ${iterations} iterations...\n`);

    // Warm up template cache
    await gitTemplateCache.getTemplatePath();

    // Benchmark old method
    console.log('Old method (multiple git config commands):');
    const oldStart = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      const repo = new TestRepository();
      await repo.init(false); // Use old method
      await repo.cleanup();
    }
    
    const oldDuration = Date.now() - oldStart;
    const oldAverage = oldDuration / iterations;
    console.log(`  Total: ${oldDuration}ms`);
    console.log(`  Average per repo: ${oldAverage.toFixed(2)}ms\n`);

    // Benchmark new method
    console.log('New method (template copy):');
    const newStart = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      const repo = new TestRepository();
      await repo.init(true); // Use template method
      await repo.cleanup();
    }
    
    const newDuration = Date.now() - newStart;
    const newAverage = newDuration / iterations;
    console.log(`  Total: ${newDuration}ms`);
    console.log(`  Average per repo: ${newAverage.toFixed(2)}ms\n`);

    // Results
    const improvement = ((oldAverage - newAverage) / oldAverage * 100).toFixed(1);
    const speedup = (oldAverage / newAverage).toFixed(1);
    
    console.log('Results:');
    console.log(`  Performance improvement: ${improvement}%`);
    console.log(`  Speedup: ${speedup}x faster`);
    console.log(`  Time saved per repo: ${(oldAverage - newAverage).toFixed(2)}ms`);
    console.log(`  Time saved for 100 tests: ${((oldAverage - newAverage) * 100 / 1000).toFixed(1)}s\n`);

    // Expect new method to be significantly faster
    expect(newAverage).toBeLessThan(oldAverage);
  }, 60000); // Allow 60 seconds for benchmark

  test('verify template method creates valid repo', async () => {
    const repo = new TestRepository();
    await repo.init(true); // Use template

    // Verify it's a valid git repo
    const status = await repo.git('status');
    expect(status.exitCode).toBe(0);

    // Verify config is set correctly  
    const gpgSign = await repo.git('config --get commit.gpgsign');
    // Config value might be empty if not set, but signing should not be required
    expect(gpgSign.stdout === 'false' || gpgSign.stdout === '').toBe(true);

    const userName = await repo.git('config --get user.name');
    expect(userName.stdout).toBe('Test User');

    // Verify we can make commits
    await repo.writeFile('test.txt', 'test content');
    await repo.git('add test.txt');
    const commit = await repo.git('commit -m "Test commit"');
    expect(commit.exitCode).toBe(0);

    await repo.cleanup();
  });

  test('measure individual operation times', async () => {
    console.log('\nDetailed timing breakdown:');
    
    const timings = {
      createDir: 0,
      copyTemplate: 0,
      gitInit: 0,
      gitConfigs: 0,
      initialCommit: 0
    };

    // Measure template creation
    const tempDir = path.join(os.tmpdir(), 'timing-test-' + Date.now());

    let start = Date.now();
    await fs.ensureDir(tempDir);
    timings.createDir = Date.now() - start;

    // Measure template copy
    start = Date.now();
    await gitTemplateCache.copyToDirectory(tempDir);
    timings.copyTemplate = Date.now() - start;

    // Clean up
    await fs.remove(tempDir);

    // Measure old method operations
    const tempDir2 = path.join(os.tmpdir(), 'timing-test2-' + Date.now());
    await fs.ensureDir(tempDir2);

    // Change to temp dir for git operations
    const originalCwd = process.cwd();
    process.chdir(tempDir2);

    const { execSync } = require('child_process');
    
    try {
      // Measure git init
      start = Date.now();
      execSync('git init', { encoding: 'utf8' });
      timings.gitInit = Date.now() - start;

      // Measure git configs (just a few key ones)
      start = Date.now();
      execSync('git config --local user.name "Test User"');
      execSync('git config --local user.email "test@example.com"');
      execSync('git config --local commit.gpgsign false');
      execSync('git config --local core.autocrlf false');
      timings.gitConfigs = Date.now() - start;

      // Measure initial commit
      start = Date.now();
      fs.writeFileSync('README.md', '# Test');
      execSync('git add .');
      execSync('git commit -m "Initial commit"');
      timings.initialCommit = Date.now() - start;
    } finally {
      process.chdir(originalCwd);
      await fs.remove(tempDir2);
    }

    console.log('\nOperation timings:');
    console.log(`  Create directory: ${timings.createDir}ms`);
    console.log(`  Copy template: ${timings.copyTemplate}ms`);
    console.log(`  Git init: ${timings.gitInit}ms`);
    console.log(`  Git configs (4 commands): ${timings.gitConfigs}ms`);
    console.log(`  Initial commit: ${timings.initialCommit}ms`);
    console.log(`\n  Template method total: ${timings.createDir + timings.copyTemplate}ms`);
    console.log(`  Old method total: ${timings.createDir + timings.gitInit + timings.gitConfigs + timings.initialCommit}ms`);
  });
});