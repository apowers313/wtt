# Git Worktree Tool (wtt)

A powerful command-line tool that streamlines git worktree workflows for parallel feature development, with automatic port management for development servers like Vite, Storybook, and more.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
  - [wt init](#wt-init)
  - [wt create](#wt-create)
  - [wt list](#wt-list)
  - [wt switch](#wt-switch)
  - [wt merge](#wt-merge)
  - [wt remove](#wt-remove)
  - [wt ports](#wt-ports)
- [Configuration](#configuration)
- [Integration Guide](#integration-guide)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Features

### 🚀 Core Features

- **Easy Worktree Management**: Create, list, switch, merge, and remove git worktrees with simple commands
- **Automatic Port Assignment**: Never worry about port conflicts when running multiple development servers
- **Smart Port Persistence**: Port assignments are saved and reused across sessions
- **Safety First**: Built-in checks for uncommitted changes, unpushed commits, and merge conflicts
- **Service Integration**: Seamless integration with Vite, Storybook, and custom development servers
- **Interactive CLI**: User-friendly prompts with colored output for better visibility
- **Environment Injection**: Automatic `.env.worktree` file generation for each worktree

### 🛡️ Safety Features

- Pre-merge validation for uncommitted changes
- Unpushed commits detection with push prompts
- Confirmation prompts before destructive operations
- Force flags for automation scenarios
- Port conflict detection and resolution

## Installation

### Prerequisites

- Node.js 14.0.0 or higher
- Git 2.20.0 or higher (with worktree support)
- A git repository

### Install Locally

```bash
# Clone the repository
git clone https://github.com/yourusername/wtt.git
cd wtt

# Install dependencies
npm install

# Make the tool executable
chmod +x wt.js

# Option 1: Use directly
./wt.js <command>

# Option 2: Install globally (recommended)
npm link
# Now you can use 'wt' from anywhere
wt <command>
```

### Install from npm (when published)

```bash
npm install -g wtt
```

## Quick Start

```bash
# 1. Navigate to your git repository
cd your-project

# 2. Initialize worktree configuration
wt init

# 3. Create a new worktree for a feature
wt create feature-auth

# 4. Navigate to the worktree
cd .worktrees/wt-feature-auth

# 5. Start development (ports are automatically configured)
npm run dev        # Uses VITE_PORT from .env.worktree
npm run storybook  # Uses STORYBOOK_PORT from .env.worktree
```

## Commands

### `wt init`

Initialize worktree configuration for your repository.

```bash
wt init
```

This command:
- Creates `.worktree-config.json` with default settings
- Creates `.worktrees/` directory for storing worktrees
- Sets up port ranges for different services

**Note**: Run this once per repository before using other commands.

### `wt create`

Create a new worktree with automatic port assignment.

```bash
wt create <branch-name> [options]
```

**Arguments:**
- `<branch-name>` - Name of the branch (required)

**Options:**
- `--from <base-branch>` - Create new branch from specified base branch

**Examples:**
```bash
# Create worktree for existing branch
wt create feature-auth

# Create new branch from 'develop'
wt create feature-ui --from develop

# Create new branch from current branch
wt create hotfix-bug --from HEAD
```

**What it does:**
1. Creates worktree at `.worktrees/wt-<branch-name>`
2. Assigns unique ports for each configured service
3. Creates `.env.worktree` with port assignments
4. Shows navigation instructions and assigned ports

**Generated files:**
- `.worktrees/wt-feature-auth/` - The worktree directory
- `.worktrees/wt-feature-auth/.env.worktree` - Environment variables

**Example .env.worktree:**
```bash
VITE_PORT=3010
STORYBOOK_PORT=6016
WORKTREE_NAME=wt-feature-auth
```

### `wt list`

List all worktrees with their status and port assignments.

```bash
wt list [options]
```

**Options:**
- `-v, --verbose` - Show detailed information including git status

**Basic output:**
```
Worktrees:
  wt-feature-auth (feature-auth) - vite:3010 storybook:6016
  wt-feature-ui (feature-ui) - vite:3020 storybook:6026

Use --verbose for detailed information
```

**Verbose output:**
```
WORKTREE           BRANCH         PORTS              STATUS
────────────────────────────────────────────────────────────
wt-feature-auth    feature-auth   vite:3010 ✓       2 commits ahead
                                  storybook:6016     Clean

wt-feature-ui      feature-ui     vite:3020         5 files modified
                                  storybook:6026 ✓   1 commit behind main
                                                    Uncommitted changes
```

**Status indicators:**
- ✓ - Service is currently running on this port
- Number of commits ahead/behind main branch
- File modification count
- Uncommitted changes warning

### `wt switch`

Display information about a worktree and show how to navigate to it.

```bash
wt switch <worktree-name>
```

**Arguments:**
- `<worktree-name>` - Name of the worktree (e.g., `wt-feature-auth`)

**Example:**
```bash
$ wt switch wt-feature-auth

Switching to worktree 'wt-feature-auth'...
Path: /home/user/project/.worktrees/wt-feature-auth

Assigned ports:
  vite: 3010 (running)
  storybook: 6016

Available npm scripts:
  npm run dev
  npm run build
  npm run test
  npm run storybook

To navigate to this worktree:
  cd /home/user/project/.worktrees/wt-feature-auth
```

**Note**: This command cannot change your shell's directory. You must manually run the provided `cd` command.

### `wt merge`

Merge a worktree's branch back to the main branch with safety checks.

```bash
wt merge <worktree-name> [options]
```

**Arguments:**
- `<worktree-name>` - Name of the worktree to merge

**Options:**
- `-d, --delete` - Delete worktree and branch after successful merge

**Example:**
```bash
$ wt merge wt-feature-auth --delete

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

**Safety checks:**
1. Verifies no uncommitted changes
2. Checks for unpushed commits (offers to push)
3. Confirms deletion if `--delete` is used
4. Cleans up port assignments

### `wt remove`

Remove a worktree and clean up its port assignments.

```bash
wt remove <worktree-name> [options]
```

**Arguments:**
- `<worktree-name>` - Name of the worktree to remove

**Options:**
- `-f, --force` - Skip all confirmation prompts

**Example:**
```bash
$ wt remove wt-feature-old

Checking worktree 'wt-feature-old'...
✓ No uncommitted changes

This will remove:
  - Worktree at /home/user/project/.worktrees/wt-feature-old
  - Port assignments: vite:3030 storybook:6036

Are you sure you want to remove this worktree? [y/N] y

Removing worktree...
✓ Removed worktree
✓ Released ports vite:3030 storybook:6036

Note: Branch 'feature-old' still exists.
To delete it, run: git branch -d feature-old
```

**Safety features:**
- Warns about uncommitted changes
- Shows what will be removed
- Requires confirmation (unless `--force`)
- Preserves the git branch (only removes worktree)

### `wt ports`

Display and manage port assignments for worktrees.

```bash
wt ports [worktree-name]
```

**Arguments:**
- `[worktree-name]` - Optional. Show ports for specific worktree

**Show all ports:**
```bash
$ wt ports

Port assignments for all worktrees:
──────────────────────────────────────────────────

wt-feature-auth
  vite: 3010 ✓
  storybook: 6016

wt-feature-ui
  vite: 3020 ✓
  storybook: 6026 ✓

Total ports in use: 4

Port ranges:
  vite: 3000-3100 (increment: 10)
  storybook: 6006-6106 (increment: 10)
  custom: 8000-8100 (increment: 10)
```

**Show specific worktree with conflict detection:**
```bash
$ wt ports wt-feature-auth

Ports for worktree 'wt-feature-auth':
  vite: 3010 (in use)
  storybook: 6016 (available)

⚠ Port conflicts detected:
  vite port 3010 is in use by another process

Would you like to reassign conflicting ports? [Y/n] Y
✓ Reassigned vite to port 3040
```

## Configuration

The tool uses `.worktree-config.json` in your repository root:

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

### Configuration Options

- **baseDir**: Directory where worktrees are stored (default: `.worktrees`)
- **portRanges**: Port allocation settings for each service
  - `start`: First port number to assign
  - `increment`: Gap between assigned ports
- **mainBranch**: Your main branch name (default: `main`)
- **namePattern**: Naming pattern for worktrees (`{branch}` is replaced)
- **autoCleanup**: Whether to clean up after merges (default: `true`)

### Adding Custom Services

To add a new service (e.g., a backend API):

1. Edit `.worktree-config.json`:
```json
{
  "portRanges": {
    "vite": { "start": 3000, "increment": 10 },
    "storybook": { "start": 6006, "increment": 10 },
    "api": { "start": 4000, "increment": 10 }
  }
}
```

2. The tool will automatically assign ports for the new service

## Integration Guide

### Vite Integration

Update `vite.config.js`:
```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: parseInt(process.env.VITE_PORT) || 3000,
    strictPort: false, // Fallback if port is taken
  }
});
```

### Storybook Integration

Update `.storybook/main.js`:
```javascript
export default {
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

Update your scripts to use environment variables:
```json
{
  "scripts": {
    "dev": "vite --port ${VITE_PORT:-3000}",
    "storybook": "storybook dev -p ${STORYBOOK_PORT:-6006}",
    "api": "node server.js --port ${API_PORT:-4000}"
  }
}
```

### Loading Environment Variables

For scripts that don't automatically load `.env.worktree`:
```json
{
  "scripts": {
    "dev": "source .env.worktree 2>/dev/null; vite --port ${VITE_PORT:-3000}"
  }
}
```

## Examples

### Complete Workflow Example

```bash
# 1. Initialize the tool
wt init

# 2. Create a feature worktree
wt create feature-user-auth --from develop

# 3. Navigate to the worktree
cd .worktrees/wt-feature-user-auth

# 4. Install dependencies (if needed)
npm install

# 5. Start development servers (ports auto-configured)
npm run dev        # Starts on port 3010
npm run storybook  # Starts on port 6016

# 6. Make changes, commit them
git add .
git commit -m "Add user authentication"
git push origin feature-user-auth

# 7. Merge back to main when done
wt merge wt-feature-user-auth --delete

# 8. You're back on main branch, worktree is cleaned up
```

### Parallel Development Example

```bash
# Terminal 1: Working on authentication
wt create feature-auth
cd .worktrees/wt-feature-auth
npm run dev  # Runs on port 3010

# Terminal 2: Working on UI components
wt create feature-ui
cd .worktrees/wt-feature-ui
npm run dev  # Runs on port 3020

# Terminal 3: Fixing a bug
wt create hotfix-header
cd .worktrees/wt-hotfix-header
npm run dev  # Runs on port 3030

# Check all running worktrees
wt list --verbose
```

## Best Practices

### 1. Naming Conventions
- Use descriptive branch names: `feature-auth`, `bugfix-header`, `hotfix-api`
- The tool will create worktrees as `wt-feature-auth`, etc.

### 2. Regular Cleanup
- Use `wt merge --delete` to keep your workspace clean
- Run `wt list` periodically to review active worktrees

### 3. Port Management
- Check port conflicts with `wt ports` if services fail to start
- The tool assigns ports in increments to avoid conflicts

### 4. Git Workflow
- Always commit changes before merging
- Push branches before using `wt merge`
- Use `--from` to branch from specific commits/branches

### 5. Team Collaboration
- Add `.worktrees/` to `.gitignore`
- Share `.worktree-config.json` with your team
- Document custom port ranges in your project README

## Troubleshooting

### "Not in a git repository"
- Ensure you're in a git repository root
- Run `git init` if needed

### "Configuration not found"
- Run `wt init` first
- Check that `.worktree-config.json` exists

### "Port already in use"
- Run `wt ports <worktree-name>` to check conflicts
- The tool will offer to reassign conflicting ports

### "Worktree already exists"
- Check `wt list` for existing worktrees
- Use a different branch name or remove the existing worktree

### "Cannot remove worktree with uncommitted changes"
- Commit or stash your changes first
- Use `wt remove --force` to override (loses changes!)

### Platform-Specific Issues

**macOS/Linux**: The tool uses `lsof` to detect running ports.

**Windows**: The tool uses `netstat` for port detection. Ensure you have appropriate permissions.

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`wt create feature-your-feature`)
3. Commit your changes
4. Push to your fork
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Acknowledgments

Built with:
- [Commander.js](https://github.com/tj/commander.js/) - CLI framework
- [Simple-git](https://github.com/steveukx/git-js) - Git operations
- [Chalk](https://github.com/chalk/chalk) - Terminal styling
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js/) - Interactive prompts