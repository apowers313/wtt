# Logging Reduction Summary

## Changes Made

Reduced the extremely verbose debug logging to only show essential information for debugging test failures.

### Files Modified

1. **`test/helpers/TestRepository.js`**
   - **Removed**: Verbose logging for every command execution (was showing command, working dir, exit code, duration, platform, full stdout/stderr)
   - **Added**: Specific environment variables to enable detailed logging when needed:
     - `DEBUG_WT_COMMANDS` - Show wt command executions
     - `DEBUG_GIT_COMMANDS` - Show git command executions  
     - `DEBUG_ALL_COMMANDS` - Show all command executions with details
   - **Kept**: Error logging for failed commands (always shown)

2. **`test/unit/gitOps.test.js`**
   - **Removed**: Verbose setup logging and detailed worktree analysis
   - **Added**: Conditional debug logging only when tests fail
   - **Added**: `DEBUG_GITOPS_SETUP` environment variable for setup logging

3. **`lib/gitOps.js`**
   - **Removed**: Always-on debug logging for worktree list operations
   - **Added**: `DEBUG_WORKTREE_LIST` environment variable for worktree debugging

### Environment Variables for Debugging

When tests fail on CI, specific debugging can be enabled:

```bash
# Show all wt command executions
DEBUG_WT_COMMANDS=1 npm test

# Show git command executions  
DEBUG_GIT_COMMANDS=1 npm test

# Show all command details
DEBUG_ALL_COMMANDS=1 npm test

# Debug worktree list parsing
DEBUG_WORKTREE_LIST=1 npm test

# Debug gitOps test setup
DEBUG_GITOPS_SETUP=1 npm test
```

### What's Still Logged

- **Command failures** - Always logged with error details
- **Test failures** - Debug info shown when tests fail
- **Essential debugging** - Only when specifically requested

### Result

- **Before**: 100+ lines of debug output per test
- **After**: Minimal output unless tests fail or debugging is requested
- **Benefit**: Much cleaner CI logs while preserving debugging capability

The Windows CI logs should now be much more readable while still providing the information needed to debug any remaining issues.