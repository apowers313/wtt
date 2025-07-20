# Git Worktree Management Tool Plan

## Overview

A command-line tool to streamline git worktree workflows for parallel feature development, with automatic port management for development servers (Storybook, Vite, etc.).

## Core Requirements

1. **Easy worktree creation and management**
   - Create worktrees with sensible naming conventions
   - List active worktrees with status information
   - Switch between worktrees quickly
   - Clean up merged worktrees automatically

2. **Automatic port conflict resolution**
   - Detect and assign unique ports for each worktree
   - Persist port assignments across sessions
   - Support multiple dev servers per worktree (e.g., Vite on 3000, Storybook on 6006)

3. **Streamlined merge workflow**
   - Quick merge back to main branch
   - Automatic cleanup after merge
   - Safety checks before deletion

## Tool Architecture

### 1. Configuration System

Create a `.worktree-config.json` in the repository root:

```json
{
  "baseDir": ".worktrees",
  "portRanges": {
    "vite": { "start": 3000, "increment": 10 },
    "storybook": { "start": 6006, "increment": 10 },
    "custom": { "start": 8000, "increment": 10 }
  },
  "mainBranch": "main",
  "namePattern": "wt-{branch}",
  "autoCleanup": true
}
```

### 2. Port Management

Store port assignments in `.worktrees/.port-map.json`:

```json
{
  "wt-feature-auth": {
    "vite": 3010,
    "storybook": 6016,
    "created": "2024-01-20T10:00:00Z"
  },
  "wt-feature-ui": {
    "vite": 3020,
    "storybook": 6026,
    "created": "2024-01-20T11:00:00Z"
  }
}
```

### 3. Environment Variable Injection

Each worktree gets a `.env.worktree` file:

```bash
VITE_PORT=3010
STORYBOOK_PORT=6016
WORKTREE_NAME=wt-feature-auth
```

Modify package.json scripts to use these variables:

```json
{
  "scripts": {
    "dev": "vite --port ${VITE_PORT:-3000}",
    "storybook": "storybook dev -p ${STORYBOOK_PORT:-6006}"
  }
}
```

## Command Structure

### Primary Commands

1. **`wt create <branch-name> [--from <base-branch>]`**
   - Creates new worktree in `.worktrees/wt-<branch-name>`
   - Assigns unique ports automatically
   - Creates `.env.worktree` file
   - Optionally creates new branch from base branch

2. **`wt list [--verbose]`**
   - Shows all worktrees with:
     - Branch name
     - Path
     - Assigned ports
     - Running processes
     - Last commit info

3. **`wt switch <worktree-name>`**
   - Changes to worktree directory
   - Shows assigned ports
   - Lists available npm scripts

4. **`wt merge <worktree-name> [--delete]`**
   - Switches to main branch
   - Merges worktree branch
   - Optionally deletes worktree and branch
   - Cleans up port assignments

5. **`wt remove <worktree-name> [--force]`**
   - Removes worktree
   - Cleans up port assignments
   - Checks for uncommitted changes

6. **`wt ports [<worktree-name>]`**
   - Shows port assignments for worktree(s)
   - Detects port conflicts
   - Allows manual port reassignment

### Helper Commands

7. **`wt status [<worktree-name>]`**
   - Shows git status for worktree(s)
   - Highlights uncommitted changes
   - Shows divergence from main

8. **`wt sync [<worktree-name>]`**
   - Pulls latest from origin
   - Rebases or merges with main
   - Updates all worktrees

9. **`wt open <service> [<worktree-name>]`**
   - Opens browser to correct port
   - e.g., `wt open vite` → http://localhost:3010

## Implementation Details

### Directory Structure

```
project-root/
├── .worktrees/                 # All worktrees stored here
│   ├── .port-map.json         # Port assignments
│   ├── wt-feature-auth/       # Worktree directory
│   ├── wt-feature-ui/         # Worktree directory
│   └── ...
├── .worktree-config.json      # Tool configuration
└── wt                         # Main tool executable
```

### Technology Stack

**Option 1: Node.js Script**
- Single `wt.js` file with shebang `#!/usr/bin/env node`
- Use `commander` for CLI parsing
- Use `simple-git` for git operations
- Use `chalk` for colored output
- Use `inquirer` for interactive prompts

**Option 2: Bash Script**
- More portable, no dependencies
- Harder to maintain complex logic
- Less user-friendly output

**Recommendation**: Node.js for better maintainability and features

### Key Implementation Functions

1. **`findAvailablePort(service, existingPorts)`**
   - Scans port-map for used ports
   - Returns next available port in range

2. **`createWorktree(branchName, options)`**
   - Runs `git worktree add`
   - Assigns ports
   - Creates `.env.worktree`
   - Updates port-map

3. **`detectRunningServers()`**
   - Uses `lsof` or `netstat` to find processes
   - Matches against known worktree ports
   - Returns active services per worktree

4. **`mergeWorktree(worktreeName, options)`**
   - Checks for uncommitted changes
   - Switches to main branch
   - Performs merge
   - Removes worktree if requested
   - Cleans up ports

### Safety Features

1. **Pre-merge checks**
   - Uncommitted changes warning
   - Unpushed commits detection
   - Conflict prediction

2. **Port conflict detection**
   - Check if assigned ports are in use by other processes
   - Automatic reassignment option

3. **Accidental deletion prevention**
   - Confirm before removing worktrees
   - Show what will be lost

## Integration with Development Tools

### Vite Configuration

Modify `vite.config.js`:

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: parseInt(process.env.VITE_PORT) || 3000,
    strictPort: false, // Fallback if port is taken
  }
});
```

### Storybook Configuration

Modify `.storybook/main.js`:

```javascript
export default {
  // ... other config
  core: {
    builder: '@storybook/builder-vite',
  },
  async viteFinal(config) {
    return {
      ...config,
      server: {
        port: parseInt(process.env.STORYBOOK_PORT) || 6006,
      }
    };
  }
};
```

### Package.json Scripts

Add wrapper scripts:

```json
{
  "scripts": {
    "dev": "source .env.worktree 2>/dev/null; vite --port ${VITE_PORT:-3000}",
    "storybook": "source .env.worktree 2>/dev/null; storybook dev -p ${STORYBOOK_PORT:-6006}",
    "wt:info": "wt ports $(basename $(pwd))"
  }
}
```

## Usage Examples

### Creating a new feature branch

```bash
# Create worktree for new feature
$ wt create feature-auth --from develop

Creating worktree 'wt-feature-auth'...
✓ Worktree created at .worktrees/wt-feature-auth
✓ Assigned ports:
  - vite: 3010
  - storybook: 6016
✓ Created .env.worktree

To start working:
  cd .worktrees/wt-feature-auth
  npm run dev        # Runs on port 3010
  npm run storybook  # Runs on port 6016
```

### Listing all worktrees

```bash
$ wt list --verbose

WORKTREE           BRANCH         PORTS              STATUS
wt-feature-auth    feature-auth   vite:3010 ✓       2 commits ahead
                                  storybook:6016     No uncommitted changes
                                  
wt-feature-ui      feature-ui     vite:3020         5 files modified
                                  storybook:6026 ✓   1 commit behind main
```

### Merging back to main

```bash
$ wt merge feature-auth --delete

Checking worktree 'wt-feature-auth'...
✓ No uncommitted changes
✓ Branch is up to date with origin

Merging to main...
✓ Switched to branch 'main'
✓ Merged 'feature-auth' (2 commits)

Delete worktree and branch? [Y/n] Y
✓ Removed worktree
✓ Deleted branch 'feature-auth'
✓ Released ports 3010, 6016
```

## Additional Features to Implement

### 1. Service Orchestration

**`wt up <worktree-name> [--services <service-list>]`**
- Starts all (or specified) dev servers in background
- Uses PM2 or node-foreman for process management
- Automatically uses assigned ports from .env.worktree
- Shows combined output with service prefixes

**`wt down <worktree-name>`**
- Stops all running services for a worktree
- Frees up ports and resources

**`wt logs <worktree-name> [--service <name>]`**
- Shows logs from running services
- Can filter by specific service
- Tail mode with `--follow`

### 2. Merge Conflict Prediction

**`wt conflicts <worktree-name> [--with <branch>]`**
- Performs dry-run merge to detect conflicts
- Shows which files would conflict
- Estimates conflict complexity (simple/moderate/complex)
- Suggests merge order when multiple worktrees exist

**`wt merge-plan`**
- Analyzes all worktrees
- Suggests optimal merge order to minimize conflicts
- Shows dependency graph if features overlap

### 3. Worktree Templates

**`wt template create <template-name>`**
- Saves current worktree state as template
- Includes: file structure, dependencies, scripts
- Stores in `.worktree-templates/`

**`wt template list`**
- Shows available templates with descriptions
- Indicates which files/configs are included

**`wt create <branch> --template <template-name>`**
- Creates worktree with pre-configured setup
- Runs template-specific initialization scripts
- Perfect for common patterns (new component, API endpoint, etc.)

Common templates might include:
- `react-component` - Component file, test, story, styles
- `api-endpoint` - Route, controller, tests, documentation  
- `feature-flag` - Config, toggle logic, tests
- `bugfix` - Test reproduction, fix template

## Success Metrics

1. Time to create new worktree: < 10 seconds
2. Zero port conflicts when running multiple worktrees
3. Single command to merge and cleanup
4. Clear visibility of all active worktrees and their states

## Getting Started

1. Create the tool script (`wt.js` or `wt`)
2. Make it executable: `chmod +x wt`
3. Add to PATH or create npm script
4. Initialize configuration: `wt init`
5. Create first worktree: `wt create my-feature`