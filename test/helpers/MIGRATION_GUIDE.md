# Test Helper Migration Guide

This guide shows how to refactor existing tests to use the new test helpers for cleaner, more maintainable tests.

## Benefits of Migration

1. **Less Brittle**: Tests focus on behavior, not implementation details
2. **Easier to Write**: High-level helpers reduce boilerplate
3. **Better Error Messages**: Helpers provide context when tests fail
4. **Handles Edge Cases**: Built-in retries and flexible matching
5. **Consistent Patterns**: All tests follow the same approach

## Migration Examples

### 1. Basic Command Execution

**Before:**
```javascript
const result = await repo.run('create feature-test --from main');
expect(result.exitCode).toBe(0);
expect(result.stdout).toContain('✓ Worktree created');
```

**After:**
```javascript
const result = await helpers.createWorktree('feature-test');
helpers.expectSuccess(result);
helpers.expectOutputContains(result, 'worktree created');
```

### 2. Port Verification

**Before:**
```javascript
const result = await repo.run('create feature-test --from main');
expect(result.stdout).toContain('vite: 3000');

const portMap = JSON.parse(await repo.readFile('.worktrees/.port-map.json'));
expect(portMap['wt-feature-test']).toMatchObject({
  vite: 3000,
  storybook: 6006,
  custom: 8000
});
```

**After:**
```javascript
const result = await helpers.createWorktree('feature-test');

// Flexible port checking
helpers.expectPortAssignment(result, 'vite', { min: 3000, max: 3100 });

// Verify port persistence
const ports = await helpers.expectPortsAssigned('feature-test', ['vite', 'storybook']);
```

### 3. File System Checks

**Before:**
```javascript
// Check worktree exists
expect(await repo.exists('.worktrees/wt-feature-test')).toBe(true);

// Check env file
const envContent = await repo.readFile('.worktrees/wt-feature-test/.env.worktree');
expect(envContent).toContain('VITE_PORT=3000');
expect(envContent).toContain('STORYBOOK_PORT=6006');
```

**After:**
```javascript
// Built-in retry for timing issues
await helpers.expectWorktreeExists('feature-test');

// Flexible env file checking
await helpers.expectEnvFile('feature-test', {
  'VITE_PORT': /\d{4}/,
  'STORYBOOK_PORT': /\d{4}/,
  'WORKTREE_NAME': 'wt-feature-test'
});
```

### 4. Interactive Commands

**Before:**
```javascript
// Complex mock setup
const mockInquirer = {
  prompt: jest.fn().mockResolvedValue({ confirm: true })
};
jest.doMock('inquirer', () => mockInquirer);

const result = await repo.run('remove wt-feature-test');
expect(result.exitCode).toBe(0);
```

**After:**
```javascript
// Simple mock helper
jest.doMock('inquirer', () => 
  InteractiveTestHelpers.mockInquirer({ confirm: true })
);

const result = await helpers.removeWorktree('feature-test');
helpers.expectSuccess(result);
```

### 5. Status Checking

**Before:**
```javascript
const result = await repo.run('list -v');
expect(result.stdout).toContain('wt-feature-test');
expect(result.stdout).toContain('Clean');
// Or maybe 'clean' or 'up to date' - brittle!
```

**After:**
```javascript
// Handles status variations automatically
await helpers.expectWorktreeStatus('feature-test', 'clean');
```

### 6. Error Cases

**Before:**
```javascript
const result = await repo.run('create existing-branch');
expect(result.exitCode).toBe(1);
expect(result.stderr).toContain('already exists');
```

**After:**
```javascript
const result = await helpers.createWorktree('existing-branch');
helpers.expectFailure(result, 'already exists');
```

### 7. Complex Workflows

**Before:**
```javascript
// Create worktree
await repo.run('create feature --from main');
expect(await repo.exists('.worktrees/wt-feature')).toBe(true);

// Make changes
await repo.writeFile('.worktrees/wt-feature/file.txt', 'content');

// Check status
const listResult = await repo.run('list -v');
expect(listResult.stdout).toContain('Uncommitted changes');

// Remove
jest.doMock('inquirer', () => ({ prompt: jest.fn().mockResolvedValue({ confirm: true }) }));
await repo.run('remove wt-feature --force');
expect(await repo.exists('.worktrees/wt-feature')).toBe(false);
```

**After:**
```javascript
// Create and verify
await helpers.createWorktree('feature');
await helpers.expectWorktreeExists('feature');

// Make changes and verify status
await repo.writeFile('.worktrees/wt-feature/file.txt', 'content');
await helpers.expectWorktreeStatus('feature', 'dirty');

// Remove and verify cleanup
await helpers.removeWorktree('feature', { force: true });
await helpers.expectWorktreeExists('feature', false);
```

## Step-by-Step Migration Process

1. **Add Helper Imports**
   ```javascript
   const { WorktreeTestHelpers } = require('../../helpers/WorktreeTestHelpers');
   const { InteractiveTestHelpers, AsyncTestHelpers } = require('../../helpers/InteractiveTestHelpers');
   ```

2. **Update Setup/Teardown**
   ```javascript
   let repo, helpers;
   
   beforeEach(async () => {
     ({ repo, helpers } = await WorktreeTestHelpers.setupTestRepo());
   });
   
   afterEach(async () => {
     await repo.cleanup();
   });
   ```

3. **Replace Command Execution**
   - Use `helpers.createWorktree()` instead of `repo.run('create ...')`
   - Use `helpers.removeWorktree()` instead of `repo.run('remove ...')`

4. **Replace Assertions**
   - Use `helpers.expectSuccess()` instead of `expect(result.exitCode).toBe(0)`
   - Use `helpers.expectOutputContains()` instead of exact string matching
   - Use `helpers.expectWorktreeExists()` instead of manual file checks

5. **Handle Timing Issues**
   - Wrap flaky assertions in `AsyncTestHelpers.retry()`
   - Use `AsyncTestHelpers.waitForFile()` when needed

6. **Simplify Mocks**
   - Use `InteractiveTestHelpers.mockInquirer()` for prompts
   - Use pre-configured mock helpers

## Common Pitfalls to Avoid

1. **Don't mix old and new patterns** - Fully convert each test
2. **Don't assume exact output** - Use flexible matchers
3. **Don't hardcode ports** - Use ranges or regex patterns
4. **Don't ignore timing** - Add retries for file system operations
5. **Don't forget cleanup** - Always restore mocks

## Quick Reference

| Old Pattern | New Helper |
|------------|------------|
| `repo.run('create X --from Y')` | `helpers.createWorktree('X', {from: 'Y'})` |
| `expect(exitCode).toBe(0)` | `helpers.expectSuccess(result)` |
| `expect(stdout).toContain('exact')` | `helpers.expectOutputContains(result, 'flexible')` |
| `repo.exists('.worktrees/wt-X')` | `helpers.expectWorktreeExists('X')` |
| Complex port checking | `helpers.expectPortAssignment()` |
| Manual env file parsing | `helpers.expectEnvFile()` |
| Complex inquirer mocks | `InteractiveTestHelpers.mockInquirer()` |