# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Git Worktree Tool (wtt) project - a command-line tool designed to streamline git worktree workflows for parallel feature development with automatic port management for development servers.

The tool has been implemented with all primary commands. Planning documents for additional features:
- `worktree-tool-plan.md` - Core architecture and features (IMPLEMENTED)
- `worktree-tool-additional-features.md` - Extended feature set (TODO)

## Development Commands

```bash
npm install              # Install dependencies
npm link                # Make 'wt' command available globally
./wt.js <command>       # Run the CLI tool directly
wt <command>            # Run globally after npm link

# Testing commands
wt init                 # Initialize in a git repository
wt create test-branch   # Create a test worktree
wt list -v             # List worktrees with details
```

## Architecture Overview

### Core Design Principles

1. **Worktree Management**: All worktrees stored in `.worktrees/` directory with `wt-{branch}` naming convention
2. **Port Management**: Automatic port assignment with persistence in `.worktrees/.port-map.json`
3. **Environment Injection**: Each worktree gets `.env.worktree` with assigned ports
4. **Safety First**: Pre-merge checks, conflict detection, and deletion prevention

### Technology Stack (Planned)

- **Runtime**: Node.js CLI with shebang `#!/usr/bin/env node`
- **CLI Framework**: commander.js
- **Git Operations**: simple-git
- **UI**: chalk (colors), inquirer (prompts)
- **Process Management**: PM2 or node-foreman (for service orchestration)

### Key Components

1. **Configuration System** (`.worktree-config.json`):
   - Port ranges for different services (Vite, Storybook, etc.)
   - Naming patterns and cleanup policies
   - Main branch designation

2. **Port Assignment System**:
   - Automatic port allocation with configurable ranges
   - Persistence across sessions
   - Conflict detection and resolution

3. **Service Integration**:
   - Environment variable injection for Vite, Storybook
   - Package.json script modifications
   - Browser opening with correct ports

### Command Structure

Primary commands to implement:
- `wt create <branch>` - Create worktree with auto port assignment
- `wt list` - Show all worktrees with status
- `wt switch <name>` - Change to worktree directory
- `wt merge <name>` - Merge and optionally cleanup
- `wt remove <name>` - Remove worktree safely
- `wt ports` - Manage port assignments

Extended commands planned:
- `wt up/down` - Service orchestration
- `wt context` - Claude Code context management
- `wt conflicts` - Merge conflict prediction

## Implementation Guidelines

1. **File Organization**:
   - Main executable: `wt` or `wt.js` in project root
   - Modular structure with separate files for:
     - Port management logic
     - Git operations
     - Configuration handling
     - CLI command definitions

2. **Error Handling**:
   - Always check for uncommitted changes before destructive operations
   - Validate port availability before assignment
   - Provide clear error messages with recovery suggestions

3. **User Experience**:
   - Colored output for better readability
   - Progress indicators for long operations
   - Interactive prompts for dangerous actions
   - Helpful command suggestions

## Special Considerations for Claude Code Integration

The tool includes specific features for AI-assisted development:
- Automatic CLAUDE.md management per worktree
- Context inheritance between worktrees
- Feature-specific instructions for AI assistants

This ensures each worktree can have its own development context while maintaining project-wide standards.

## Security and Workflow Guidelines

- You may disable GPG signing for tests, but NEVER disable GPG signing for our actual code commits and NEVER EVER EVER git commit code or git add code on my behalf
- NEVER commit on my behalf, always let me do the git commits manually
- Do not git add files for me, I will do that myself

## AI Interaction Guidelines

- If I share a URL with you and you can't access it, stop and let me know