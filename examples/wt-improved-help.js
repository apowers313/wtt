#!/usr/bin/env node

/**
 * Improved WTT with integrated commander.js help system
 * Demonstrates Phase 3 improvements: help system integration
 */

const { Command } = require('commander');
const chalk = require('chalk');

const program = new Command();

// Enhanced program setup with global options
program
  .name('wt')
  .description('Git Worktree Tool - Streamline git worktree workflows with automatic port management')
  .version('2.0.0')
  .option('-v, --verbose', 'show detailed output for all commands')
  .option('-q, --quiet', 'suppress non-error output')
  .addHelpText('before', `
${chalk.bold.blue('Git Worktree Tool (WTT)')} - Efficient parallel development with automatic port management
`)
  .addHelpText('after', `
${chalk.bold('Quick Start:')}
  $ wt init                      # Initialize in your git repository
  $ wt create feature-auth       # Create worktree for new feature
  $ wt list                      # See all your worktrees
  $ wt switch feature-auth       # Switch to worktree (spawns shell)
  $ wt merge feature-auth        # Merge and cleanup when done

${chalk.bold('Examples:')}
  $ wt create fix-bug --from main    # Create branch from specific base
  $ wt list --verbose               # Detailed worktree information
  $ wt merge --no-delete            # Merge but keep worktree
  $ wt remove old-feature           # Clean up unused worktree

${chalk.bold('Getting Help:')}
  $ wt <command> --help             # Command-specific help
  $ wt help topics                  # Browse help topics
  $ wt help getting-started         # Quick start guide

For more information, visit: https://github.com/user/wtt
`);

// Initialize command with enhanced help
program
  .command('init')
  .description('initialize worktree configuration for the repository')
  .addHelpText('after', `
${chalk.bold('What this does:')}
  • Creates .worktree-config.json with default settings
  • Creates .worktrees/ directory for all worktrees
  • Updates .gitignore to exclude worktree files
  • Sets up port ranges for development servers

${chalk.bold('Examples:')}
  $ wt init                         # Initialize with defaults
  
${chalk.bold('Files created:')}
  • .worktree-config.json          # Main configuration
  • .worktrees/                    # Worktree directory
  • .worktrees/.port-map.json      # Port assignments

${chalk.bold('Exit codes:')}
  0  initialization successful
  1  already initialized (warning)
  2  not in git repository
`)
  .action(async (options) => {
    console.log(chalk.blue('wt init: initializing worktree configuration...'));
    console.log(chalk.green('wt init: configuration created successfully'));
  });

// Create command with comprehensive help
program
  .command('create <branch-name>')
  .description('create new worktree with automatic port assignment')
  .option('--from <base-branch>', 'create new branch from specified base (default: main)')
  .option('--no-ports', 'skip automatic port assignment')
  .addHelpText('after', `
${chalk.bold('What this does:')}
  • Creates git worktree in .worktrees/wt-<branch-name>/
  • Assigns unique ports for development servers (Vite, Storybook, etc.)
  • Creates .env.worktree file with port assignments
  • Sets up isolated development environment

${chalk.bold('Examples:')}
  $ wt create feature-auth              # Create from main branch
  $ wt create fix-bug --from develop    # Create from specific branch
  $ wt create hotfix --from v1.2.3     # Create from tag
  $ wt create prototype --no-ports     # Skip port assignment

${chalk.bold('Port assignment:')}
  • vite: 3000-3099        (React/Vue dev server)
  • storybook: 6006-6106   (Component library)
  • custom: 8080-8179      (Custom services)

${chalk.bold('Exit codes:')}
  0  worktree created successfully
  1  branch or worktree already exists
  2  invalid branch name or git error
`)
  .action(async (branchName, options) => {
    console.log(`wt create: creating worktree '${branchName}'...`);
    console.log(`wt create: created worktree '${branchName}' at .worktrees/wt-${branchName}`);
  });

// List command with detailed help
program
  .command('list')
  .alias('ls')
  .description('list all worktrees with their status')
  .option('-v, --verbose', 'show detailed information (ports, git status, etc.)')
  .addHelpText('after', `
${chalk.bold('Output formats:')}
  Normal:  Lists worktree names in a single line
  Verbose: Table with worktree, branch, ports, and git status

${chalk.bold('Examples:')}
  $ wt list                         # Simple list
  $ wt list --verbose              # Detailed table
  $ wt ls -v                       # Short alias with verbose

${chalk.bold('Status indicators (verbose mode):')}
  • clean     - No uncommitted changes
  • 3 changes - Number of modified files
  • error     - Git status check failed

${chalk.bold('Exit codes:')}
  0  list displayed successfully
  2  not in git repository
`)
  .action(async (options) => {
    if (options.verbose) {
      console.log('WORKTREE           BRANCH         PORTS              STATUS');
      console.log('─'.repeat(70));
      console.log('feature-auth       feature-auth   vite:3001 sb:6007  clean');
      console.log('bug-fix            bug-fix        vite:3002 sb:6008  2 changes');
    } else {
      console.log('wt list: 2 worktrees: feature-auth, bug-fix');
    }
  });

// Switch command with shell integration help
program
  .command('switch [worktree-name]')
  .alias('sw')
  .description('switch to worktree directory (spawns new shell)')
  .option('--no-shell', 'just cd to directory without spawning shell')
  .addHelpText('after', `
${chalk.bold('What this does:')}
  • Spawns new shell in worktree directory
  • Sets custom prompt showing worktree name
  • Loads .env.worktree with port assignments
  • Sets WT_WORKTREE and WT_WORKTREE_PATH variables

${chalk.bold('Examples:')}
  $ wt switch feature-auth          # Switch to specific worktree
  $ wt switch                       # Auto-detect from current directory
  $ wt sw --no-shell               # Just change directory

${chalk.bold('Shell features:')}
  • Custom prompt: [wt:feature-auth] user@host ~/project/.worktrees/wt-feature-auth $
  • Environment variables available for scripts
  • Type 'exit' to return to original directory

${chalk.bold('Auto-detection:')}
  If run from within a worktree, switches to that worktree's shell mode.
  If run from outside, you must specify the worktree name.

${chalk.bold('Exit codes:')}
  0  shell exited normally
  1  worktree not found
  2  validation error
`)
  .action(async (worktreeName, options) => {
    const name = worktreeName || 'current';
    console.log(`wt switch: switching to worktree '${name}'`);
    console.log('Type "exit" to return to original directory');
  });

// Merge command with conflict handling help
program
  .command('merge [worktree-name]')
  .description('merge worktree branch into main branch')
  .option('-d, --delete', 'delete worktree after successful merge')
  .option('--no-delete', 'keep worktree after merge (override autoCleanup)')
  .option('--check', 'preview merge and check for conflicts')
  .option('--abort', 'abort current merge operation')
  .option('-f, --force', 'skip confirmation prompts')
  .addHelpText('after', `
${chalk.bold('Safety features:')}
  • Pre-merge validation (uncommitted changes, conflicts)
  • Automatic backup before merge (use 'wt restore' to recover)
  • Conflict detection and clear error messages
  • Port cleanup on successful merge with --delete

${chalk.bold('Examples:')}
  $ wt merge feature-auth           # Merge specific worktree
  $ wt merge                        # Auto-detect current worktree
  $ wt merge --check               # Preview without merging
  $ wt merge --delete              # Merge and cleanup
  $ wt merge --abort               # Abort current merge

${chalk.bold('Conflict resolution:')}
  1. wt merge feature-auth         # Start merge
  2. # If conflicts: edit files, then 'git add .' and 'git commit'
  3. wt merge feature-auth         # Continue merge
  
  Or use conflict helpers:
  $ wt conflicts list              # Show current conflicts
  $ wt conflicts fix              # Interactive resolution

${chalk.bold('Exit codes:')}
  0  merge successful
  1  merge conflicts (resolve manually)
  2  validation error (fix issues first)
`)
  .action(async (worktreeName, options) => {
    if (options.check) {
      console.log('wt merge: preview mode - no conflicts detected');
      return;
    }
    if (options.abort) {
      console.log('wt merge: aborted merge operation');
      return;
    }
    const name = worktreeName || 'current';
    console.log(`wt merge: merged '${name}' into main`);
  });

// Remove command with safety help
program
  .command('remove [worktree-name]')
  .alias('rm')
  .description('remove worktree and release ports')
  .option('-f, --force', 'force removal even with uncommitted changes')
  .addHelpText('after', `
${chalk.bold('Safety checks:')}
  • Prevents removal of current worktree
  • Checks for uncommitted changes (use --force to override)
  • Validates worktree exists and is managed by wtt
  • Releases assigned ports automatically

${chalk.bold('Examples:')}
  $ wt remove old-feature          # Remove specific worktree
  $ wt remove                      # Auto-detect current worktree
  $ wt rm -f dirty-worktree       # Force remove with changes

${chalk.bold('What gets removed:')}
  • Worktree directory and all files
  • Git worktree registration
  • Port assignments
  • Environment configuration

${chalk.bold('Recovery:')}
  If you accidentally remove a worktree, you may be able to recover
  uncommitted changes from git reflog or recent backups.

${chalk.bold('Exit codes:')}
  0  worktree removed successfully
  1  uncommitted changes (use --force)
  2  worktree not found or validation error
`)
  .action(async (worktreeName, options) => {
    const name = worktreeName || 'current';
    console.log(`wt remove: removed worktree '${name}'`);
  });

// Ports command with management help
program
  .command('ports [worktree-name]')
  .description('display and manage port assignments')
  .option('--release <worktree>', 'release ports for specific worktree')
  .option('--assign <worktree>', 'assign new ports to worktree')
  .addHelpText('after', `
${chalk.bold('Port management:')}
  • Automatic assignment during worktree creation
  • Persistent assignments across sessions
  • Conflict detection and resolution
  • Manual release/reassignment when needed

${chalk.bold('Examples:')}
  $ wt ports                       # Show all port assignments
  $ wt ports feature-auth         # Show ports for specific worktree
  $ wt ports --release old-feat   # Release ports manually
  $ wt ports --assign new-feat    # Assign new ports

${chalk.bold('Port ranges:')}
  • vite: 3000-3099        (Configurable in .worktree-config.json)
  • storybook: 6006-6106   (Each service has its own range)
  • custom: 8080-8179      (For additional development servers)

${chalk.bold('Usage in development:')}
  Ports are automatically set in .env.worktree:
    VITE_PORT=3001
    STORYBOOK_PORT=6007
    CUSTOM_PORT=8081

${chalk.bold('Exit codes:')}
  0  ports displayed/managed successfully
  1  port assignment conflict
  2  worktree not found
`)
  .action(async (worktreeName, options) => {
    if (options.release) {
      console.log(`wt ports: released ports for '${options.release}'`);
      return;
    }
    if (options.assign) {
      console.log(`wt ports: assigned new ports to '${options.assign}'`);
      return;
    }
    if (worktreeName) {
      console.log(`wt ports: feature-auth -> vite:3001, storybook:6007, custom:8081`);
    } else {
      console.log('wt ports: 2 worktrees with port assignments');
    }
  });

// Help topics command
program
  .command('help [topic]')
  .description('show help for specific topics')
  .option('-i, --interactive', 'browse help topics interactively')
  .addHelpText('after', `
${chalk.bold('Available topics:')}
  getting-started      Quick start guide and basic workflow
  configuration        Configuration file options and port setup
  merge-conflicts      Handling and resolving merge conflicts
  troubleshooting      Common issues and solutions
  development-workflow Best practices for parallel development
  port-management     Advanced port configuration and management

${chalk.bold('Examples:')}
  $ wt help                        # Show main help
  $ wt help getting-started       # Quick start guide
  $ wt help merge-conflicts       # Conflict resolution help
  $ wt help --interactive         # Browse topics interactively

${chalk.bold('Command-specific help:')}
  $ wt <command> --help           # Detailed help for any command
  $ wt create --help              # Create command help
  $ wt merge --help               # Merge command help
`)
  .action(async (topic, options) => {
    if (options.interactive) {
      console.log('Interactive help browser (not implemented in demo)');
      return;
    }
    
    if (!topic) {
      console.log(`
${chalk.bold('Available help topics:')}
  getting-started      Quick start guide and basic workflow
  configuration        Configuration file options and port setup
  merge-conflicts      Handling and resolving merge conflicts
  troubleshooting      Common issues and solutions
  development-workflow Best practices for parallel development
  port-management     Advanced port configuration and management

Use: wt help <topic> for detailed information
      `);
      return;
    }
    
    console.log(`wt help: showing help for topic '${topic}'`);
  });

// Demo command to show help examples
program
  .command('demo-help')
  .description('demonstrate the improved help system')
  .action(() => {
    console.log(`
${chalk.bold.blue('🔧 WTT Improved Help System Demo')}

${chalk.bold('1. Main help (wt --help):')}
   Shows overview, quick start, examples, and available commands

${chalk.bold('2. Command help (wt create --help):')}
   Detailed help with:
   • What the command does
   • All available options
   • Usage examples
   • Exit codes
   • Related topics

${chalk.bold('3. Help topics (wt help <topic>):')}
   In-depth guides for:
   • getting-started - Setup and basic workflow
   • merge-conflicts - Conflict resolution strategies
   • configuration - Advanced configuration options

${chalk.bold('4. Context-sensitive help:')}
   • Help text adapts to command context
   • Examples relevant to specific operations
   • Exit codes explained for each command

${chalk.bold('Try these commands:')}
   wt create --help                # See detailed create help
   wt merge --help                 # See merge options and examples
   wt help getting-started         # See topic-based help
   wt help                         # Browse all available topics

${chalk.green('✅ Help is now integrated, contextual, and comprehensive!')}
    `);
  });

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

main();