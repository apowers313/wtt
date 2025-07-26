# Test Helpers Documentation

This directory contains reusable test utilities designed to make tests faster, more reliable, and easier to write.

## Quick Start

```javascript
const { 
  TestFactory, 
  TestAssertions, 
  MockSetup 
} = require('../helpers');

// For integration tests with mock git
const { repo, helpers } = await TestFactory.createScenario('clean-repo');

// For unit tests with mocks
const mocks = MockSetup.createMockEnvironment();
```

## Helper Modules

### TestFactory

Creates common test scenarios with pre-configured mock repositories.

```javascript
// Available scenarios:
await TestFactory.createScenario('clean-repo')         // Empty repo with main branch
await TestFactory.createScenario('with-worktree')      // Repo with one worktree
await TestFactory.createScenario('merge-conflict')     // Repo with conflicting branches
await TestFactory.createScenario('multiple-worktrees') // Repo with 3 worktrees
await TestFactory.createScenario('dirty-worktree')     // Repo with uncommitted changes
```

### TestAssertions

Common assertions for worktree tests.

```javascript
// Exit code assertions
TestAssertions.success(result)                    // exitCode === 0
TestAssertions.failure(result)                    // exitCode !== 0
TestAssertions.exitCode(result, 2)               // Specific exit code

// Output assertions
TestAssertions.outputContains(result, 'created')  // Check stdout+stderr
TestAssertions.outputMatches(result, /port.*\d+/) // Regex match
TestAssertions.outputDoesNotContain(result, 'error')

// Worktree assertions
TestAssertions.worktreeExists(repo, 'feature')    // Verify worktree exists
TestAssertions.worktreeCount(repo, 3)            // Check worktree count

// Port assertions
TestAssertions.portsAssigned(portMap, 'feature', ['vite', 'storybook'])
TestAssertions.noPortsAssigned(portMap, 'feature')

// Git state assertions
TestAssertions.currentBranch(repo, 'main')
TestAssertions.branchExists(repo, 'feature')
TestAssertions.hasCommit(repo, 'Initial commit')
TestAssertions.isClean(repo)
TestAssertions.isDirty(repo)

// File assertions
TestAssertions.fileExists(repo, 'test.txt')
TestAssertions.fileContains(repo, 'test.txt', 'content')
```

### MockSetup

Creates consistent mock objects for unit tests.

```javascript
// Individual mocks
const gitOps = MockSetup.gitOps({ getCurrentBranch: jest.fn().mockResolvedValue('develop') });
const portManager = MockSetup.portManager({ 'wt-feature': { vite: 3000 } });
const config = MockSetup.config({ mainBranch: 'master' });

// Complete environment
const mocks = MockSetup.createMockEnvironment({
  gitOps: { getCurrentBranch: jest.fn().mockResolvedValue('develop') },
  ports: { 'wt-existing': { vite: 3000 } },
  config: { mainBranch: 'master' },
  inquirerAnswers: { confirmDelete: true }
});
```

### ConsoleCapture

Captures console output during tests.

```javascript
// Manual capture
const capture = new ConsoleCapture();
capture.start();
console.log('test output');
const output = capture.stop();
expect(output.stdout).toBe('test output');

// Automatic capture
const output = ConsoleCapture.capture(() => {
  console.log('captured');
});

// Async with result
const { result, output } = await ConsoleCapture.captureAsync(async () => {
  console.log('processing...');
  return await someAsyncOperation();
});
```

### TestPathUtils

Simplified path operations to replace complex `pathsEqual` function.

```javascript
// Path comparison
TestPathUtils.areEqual('/foo/bar', '/foo/bar/')     // true
TestPathUtils.compareForTest(actualPath, expectedPath) // handles edge cases

// Path manipulation
TestPathUtils.normalize('/foo//bar/../baz')         // '/foo/baz'
TestPathUtils.join('foo', 'bar', 'baz')            // 'foo/bar/baz'
TestPathUtils.relative('/a/b/c', '/a/b/d/e')       // '../d/e'
```

### MockRepository

In-memory git repository for fast tests.

```javascript
const repo = new MockRepository();
await repo.init();

// Run commands
const result = await repo.run('create feature');
expect(result.exitCode).toBe(0);

// Direct manipulation
await repo.createBranch('develop');
await repo.checkout('develop');
await repo.writeFile('test.txt', 'content');
await repo.commit('Add test file');

// Check state
repo.mockGit.state.branches         // ['main', 'develop', 'feature']
repo.mockGit.state.currentBranch    // 'develop'
repo.mockGit.state.worktrees        // Array of worktree objects
repo.portMap                        // { 'wt-feature': { vite: 3001 } }
```

## Best Practices

### 1. Use TestFactory for Integration Tests

Instead of complex setup:
```javascript
// ❌ Old way
const repo = new TestRepository();
await repo.init();
await repo.installTool();
await repo.run('init');
// ... more setup
```

Use scenarios:
```javascript
// ✅ New way
const { repo, helpers } = await TestFactory.createScenario('with-worktree');
```

### 2. Use MockSetup for Unit Tests

Instead of manual mocks:
```javascript
// ❌ Old way
const gitOps = {
  getCurrentBranch: jest.fn().mockResolvedValue('main'),
  getBranches: jest.fn().mockResolvedValue(['main']),
  // ... many more
};
```

Use MockSetup:
```javascript
// ✅ New way
const mocks = MockSetup.createMockEnvironment();
```

### 3. Use TestAssertions for Clarity

Instead of:
```javascript
// ❌ Unclear
expect(result.exitCode).toBe(0);
expect(result.stderr).toBe('');
expect(result.stdout).toContain('Created');
```

Use:
```javascript
// ✅ Clear intent
TestAssertions.success(result);
TestAssertions.outputContains(result, 'Created');
```

### 4. Avoid Timing Dependencies

Never use:
```javascript
// ❌ Flaky
await sleep(1000);
await retry(() => checkSomething(), 3);
```

MockRepository operations are synchronous:
```javascript
// ✅ Deterministic
await repo.createWorktree('feature');
TestAssertions.worktreeExists(repo, 'feature');
```

## Running Tests

```bash
# Run all tests with mocks (fast)
npm test

# Run smoke tests with real git (slow)
SMOKE_TESTS=true npm test test/smoke

# Run specific test file
npm test test/integration/create-refactored.test.js
```

## Migration Guide

To migrate existing tests:

1. Replace `WorktreeTestHelpers.setupTestRepo()` with `TestFactory.createScenario()`
2. Replace manual assertions with `TestAssertions` methods
3. Replace `pathsEqual()` with `TestPathUtils.areEqual()`
4. Replace manual mocks with `MockSetup`
5. Remove retry logic and sleep calls
6. Use `ConsoleCapture` instead of manually redirecting console methods

See `test/integration/create-refactored.test.js` and `test/unit/commands/create-refactored.test.js` for complete examples.