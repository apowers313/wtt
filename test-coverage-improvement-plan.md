# Test Coverage Improvement Plan for WTT

## Current State
- **Current Coverage**: 26.73% (173/647 statements)
- **Target Coverage**: 90%
- **Gap**: 63.27% improvement needed

## Key Issues
1. All command files show 0% coverage (but are tested via integration tests)
2. The coverage tool doesn't capture child process executions
3. Some critical lib functions lack unit tests

## Prioritized Testing Roadmap

### Phase 1: Command Unit Tests (Priority: HIGH)
**Impact**: Will increase coverage from ~27% to ~70%

Add direct unit tests for all command modules to capture coverage properly:

1. **commands/create.js** (97 lines uncovered)
   - Mock all dependencies (gitOps, portManager, config, prompter)
   - Test success paths and error scenarios
   - Use @inquirer/testing for prompt interactions

2. **commands/remove.js** (152 lines uncovered)
   - Test safety checks (uncommitted changes, unpushed commits)
   - Test force removal scenarios
   - Mock git operations and file system

3. **commands/merge.js** (112 lines uncovered)
   - Test pre-merge checks
   - Test conflict detection
   - Test auto-cleanup scenarios

4. **commands/list.js** (105 lines uncovered)
   - Test different output formats (normal, verbose, json)
   - Test filtering and sorting

5. **commands/ports.js** (108 lines uncovered)
   - Test port assignment/release
   - Test port conflict resolution
   - Test list and show subcommands

6. **commands/switch.js** (63 lines uncovered)
   - Test directory switching
   - Test error handling for non-existent worktrees

### Phase 2: Critical Library Functions (Priority: HIGH)
**Impact**: Will increase coverage from ~70% to ~85%

Complete coverage for core library modules:

1. **gitOps.js** missing functions:
   ```javascript
   - getMainBranch()
   - isWorktreePath()
   - getWorktreeInfo()
   - hasUnpushedCommits()
   - deleteBranch()
   - fetch/push/pull operations
   ```

2. **portManager.js** missing coverage:
   ```javascript
   - isPortInUse() (platform-specific logic)
   - getRunningPorts()
   - Error handling branches
   ```

### Phase 3: Edge Cases & Error Paths (Priority: MEDIUM)
**Impact**: Will increase coverage from ~85% to ~90%+

1. Network failure scenarios
2. File system permission errors
3. Invalid git repository states
4. Port exhaustion scenarios
5. Concurrent operation conflicts

## Implementation Strategy

### 1. Update Test Infrastructure

```javascript
// test/setup/mockHelpers.js
const { MockPrompter } = require('@inquirer/testing');

// Create reusable mock factories
function createMockGitOps() {
  return {
    createWorktree: jest.fn(),
    removeWorktree: jest.fn(),
    // ... other methods
  };
}

function createMockPortManager() {
  return {
    assignPort: jest.fn().mockResolvedValue(3000),
    releasePort: jest.fn(),
    // ... other methods
  };
}
```

### 2. Command Unit Test Template

```javascript
// test/unit/commands/create.test.js
const { render } = require('@inquirer/testing');
const { createCommand } = require('../../../commands/create');

jest.mock('../../../lib/gitOps');
jest.mock('../../../lib/portManager');
jest.mock('../../../lib/config');

describe('create command', () => {
  let mockGitOps, mockPortManager, mockConfig;

  beforeEach(() => {
    mockGitOps = createMockGitOps();
    mockPortManager = createMockPortManager();
    mockConfig = createMockConfig();
  });

  test('creates worktree with port assignment', async () => {
    mockGitOps.checkUncommittedChanges.mockResolvedValue(false);
    mockGitOps.branchExists.mockResolvedValue(false);
    
    await createCommand.handler({ branch: 'feature-test' });
    
    expect(mockGitOps.createWorktree).toHaveBeenCalledWith(
      'feature-test',
      '.worktrees/wt-feature-test'
    );
    expect(mockPortManager.assignPort).toHaveBeenCalled();
  });

  test('prompts for branch name when not provided', async () => {
    const { answer, events } = await render(/* prompt config */);
    
    events.type('my-branch');
    events.keypress('enter');
    
    await expect(answer).resolves.toBe('my-branch');
  });

  test('handles existing branch error', async () => {
    mockGitOps.branchExists.mockResolvedValue(true);
    
    await expect(createCommand.handler({ branch: 'existing' }))
      .rejects.toThrow('Branch already exists');
  });
});
```

### 3. Testing Order

1. **Week 1**: Set up @inquirer/testing and mock infrastructure
2. **Week 1-2**: Implement command unit tests (create, remove, merge)
3. **Week 2**: Complete remaining commands (list, ports, switch)
4. **Week 3**: Add missing gitOps and portManager tests
5. **Week 3-4**: Add edge case and error path tests

## Success Metrics

- [ ] All command files have >90% coverage
- [ ] All lib files have >90% coverage
- [ ] Overall project coverage >90%
- [ ] All critical error paths tested
- [ ] Tests run in <30 seconds

## Benefits of This Approach

1. **Immediate Impact**: Command unit tests will dramatically increase coverage
2. **Better Error Detection**: Direct unit tests catch edge cases better
3. **Faster Feedback**: Unit tests run much faster than integration tests
4. **Maintainability**: Easier to test specific scenarios in isolation
5. **Documentation**: Tests serve as usage examples

## Next Steps

1. Install @inquirer/testing: `npm install --save-dev @inquirer/testing`
2. Create mock helper utilities
3. Start with `create.js` command as proof of concept
4. Iterate through remaining commands in priority order