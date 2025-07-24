# Tmux Integration Design for Git Worktree Tool

## Overview

This document outlines the design for integrating tmux session management into the Git Worktree Tool (wtt). The integration will automatically create and manage tmux sessions/windows that correspond to git worktrees, providing a seamless development environment where each worktree has its own tmux context.

## Goals

1. **Automatic Session Management**: Create/remove tmux sessions/windows aligned with worktree lifecycle
2. **Context Preservation**: Each worktree gets its own tmux window with proper working directory
3. **Seamless Navigation**: Enable true directory switching through tmux
4. **Non-Intrusive**: Feature should be optional and not break existing workflows
5. **Smart Detection**: Only activate when running inside tmux

## Detection Strategy

- Check for `TMUX` environment variable to detect if running inside tmux
- If `TMUX` is not set, tmux features are silently disabled
- Add `--no-tmux` flag to explicitly disable tmux integration when needed

## Implementation Plan

### 1. Core Tmux Module (`lib/tmux.js`)

Create a new module to handle all tmux operations:

```javascript
class TmuxManager {
  // Core detection
  isInsideTmux() // Check TMUX env var
  isTmuxAvailable() // Check if tmux command exists
  
  // Session management
  createSession(sessionName, startDirectory)
  sessionExists(sessionName)
  
  // Window management
  createWindow(sessionName, windowName, startDirectory)
  windowExists(sessionName, windowName)
  removeWindow(sessionName, windowName)
  switchToWindow(sessionName, windowName)
  
  // Utility methods
  getSessionName() // Get project-based session name
  getWindowName(worktreeName) // Convert worktree name to window name
  executeInWindow(sessionName, windowName, command)
}
```

### 2. Session Naming Convention

- **Session Name**: Use the repository name or project directory name
  - Extract from git remote URL or current directory name
  - Sanitize to remove special characters
  - Example: `wtt` for the worktree tool project
  
- **Window Name**: Use the branch name (without `wt-` prefix)
  - Example: `feature-auth` for worktree `wt-feature-auth`

### 3. Command Modifications

#### `wt init` Command
1. Detect if inside tmux
2. If yes, create or attach to project session:
   ```bash
   tmux new-session -d -s "project-name" -n "main" -c "/path/to/repo"
   ```
3. Store session name in `.worktree-config.json`:
   ```json
   {
     "tmux": {
       "enabled": true,
       "sessionName": "project-name"
     }
   }
   ```

#### `wt create <branch>` Command
1. Create worktree as normal
2. If tmux is enabled:
   ```bash
   # Create new window in project session
   tmux new-window -t "session:^" -n "branch-name" -c "/path/to/worktree"
   
   # Switch to the new window
   tmux select-window -t "session:branch-name"
   ```
3. Store window mapping in port-map.json:
   ```json
   {
     "wt-feature": {
       "ports": { ... },
       "tmux": {
         "window": "feature"
       }
     }
   }
   ```

#### `wt remove <name>` Command
1. Check if tmux window exists for the worktree
2. If window is current window, switch to main window first
3. Kill the tmux window:
   ```bash
   tmux kill-window -t "session:window-name"
   ```
4. Proceed with normal worktree removal

#### `wt switch <name>` Command
1. If tmux is enabled, switch to the corresponding window:
   ```bash
   tmux select-window -t "session:window-name"
   ```
2. If window doesn't exist, create it
3. Fall back to displaying path if not in tmux

### 4. Edge Cases and Error Handling

#### Case 1: Tmux Session Already Exists
- When running `wt init`, check if session exists
- If it does, validate it's for the same project
- Option to force recreate or attach to existing

#### Case 2: Window Name Conflicts
- Branch names might conflict with existing window names
- Add numeric suffix if needed: `feature`, `feature-2`, etc.
- Store actual window name in metadata

#### Case 3: Tmux Server Not Running
- Gracefully handle when tmux server can't be started
- Fall back to non-tmux behavior
- Show informative message

#### Case 4: Nested Tmux Sessions
- Detect if already in a tmux session
- Prevent creating nested sessions
- Use windows within current session

#### Case 5: Remote/SSH Sessions
- Tmux might behave differently over SSH
- Test for session persistence
- Handle detached sessions gracefully

#### Case 6: Window Already Exists
- When creating worktree, window might already exist
- Either reuse or create with suffix
- Prompt user for preference

#### Case 7: Multiple Repositories
- User might work on multiple repos simultaneously
- Each repo gets its own tmux session
- Session names must be unique

### 5. Configuration Options

Add to `.worktree-config.json`:
```json
{
  "tmux": {
    "enabled": true,
    "sessionName": "project-name",
    "windowNaming": "branch",  // or "worktree"
    "autoSwitch": true,
    "createLayout": false,     // Future: auto-create pane layouts
    "mainWindowName": "main"
  }
}
```

### 6. User Experience Enhancements

#### Status Indicators
- Show tmux window name in `wt list` output
- Indicate which worktree is currently active (current tmux window)
- Show if tmux integration is enabled/disabled

#### Interactive Features
- Prompt to create tmux session on first `wt create` if not in tmux
- Option to disable tmux integration per-command: `--no-tmux`
- Global disable via environment variable: `WT_NO_TMUX=1`

#### Help and Documentation
- Add tmux section to help text
- Explain benefits and how to use
- Troubleshooting guide for common issues

### 7. Implementation Phases

#### Phase 1: Basic Integration (MVP)
1. Implement tmux detection
2. Create windows on `wt create`
3. Remove windows on `wt remove`
4. No session management yet

#### Phase 2: Session Management
1. Add session creation on `wt init`
2. Implement `wt switch` with tmux
3. Handle edge cases

#### Phase 3: Advanced Features
1. Pane layouts for services
2. Save/restore window arrangements
3. Integration with `wt up/down` commands

### 8. Testing Strategy

#### Unit Tests
- Mock tmux commands
- Test detection logic
- Verify command generation

#### Integration Tests
- Test with real tmux (if available in CI)
- Verify session/window creation
- Test error scenarios

#### Manual Testing Checklist
- [ ] Test inside tmux session
- [ ] Test outside tmux
- [ ] Test with tmux server not running
- [ ] Test SSH sessions
- [ ] Test multiple projects
- [ ] Test branch name edge cases

### 9. Backward Compatibility

- Tmux features are opt-in by default
- Existing workflows continue to work
- No breaking changes to command interface
- Configuration migration handled automatically

### 10. Future Enhancements

1. **Pane Layouts**: Pre-configured layouts for development
2. **Service Integration**: Auto-start services in panes
3. **Session Templates**: Customizable window/pane setups
4. **Persistence**: Save/restore session state
5. **Multi-Monitor**: Optimize for multiple displays

## Summary

This tmux integration will enhance the worktree tool by providing seamless context switching and session management. The implementation is designed to be non-intrusive, backward compatible, and provide clear value to users who work with multiple worktrees simultaneously.