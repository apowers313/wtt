#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const config = require('./lib/config');
const { createCommand } = require('./commands/create');
const { listCommand } = require('./commands/list');
const { switchCommand } = require('./commands/switch');
const { mergeCommand } = require('./commands/merge');
const { removeCommand } = require('./commands/remove');
const { portsCommand } = require('./commands/ports');
const { addCommandContext } = require('./lib/errorTranslator');
const { conflictsListCommand, conflictsFixCommand, conflictsPredictCommand, conflictsAcceptCommand } = require('./commands/conflicts');
const { recoveryFindCommitsCommand, recoveryRestoreCommand, recoveryStashCommand } = require('./commands/recovery');
const panicCommand = require('./commands/panic');
const helpSystem = require('./lib/ui/help-system');
const { saveWorkCommand, restoreWorkCommand, listStashCommand } = require('./commands/stash');
const { restoreCommand } = require('./commands/restore');
const { mergeAbortCommand } = require('./commands/merge-abort');

const program = new Command();

program
  .name('wt')
  .description('Git Worktree Tool - Streamline git worktree workflows with automatic port management')
  .version('1.0.0')
  .addHelpText('after', `
Examples:
  $ wt init                      Initialize worktree configuration
  $ wt create feature-auth       Create worktree for existing branch
  $ wt create fix-bug --from main Create new branch from main
  $ wt list -v                   List all worktrees with details
  $ wt switch wt-feature-auth    Switch to worktree (spawns new shell)
  $ wt merge wt-feature-auth -d  Merge and delete worktree
  $ wt remove wt-old-feature     Remove a worktree
  $ wt ports                     Show all port assignments

For more information, run 'wt <command> --help'`);

program
  .command('init')
  .description('Initialize worktree configuration for the repository (creates .worktree-config.json and .worktrees/ directory)')
  .action(async () => {
    try {
      const configExists = await config.exists();
      await config.init();
      if (configExists) {
        console.log(chalk.yellow('✓ Configuration already exists'));
      } else {
        console.log(chalk.green('✓ Initialized worktree configuration'));
        console.log(chalk.green('✓ Updated .gitignore to exclude worktree files'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      const context = addCommandContext(error.message, 'init');
      if (context.tips && context.tips.length > 0) {
        console.error(chalk.yellow('\nTips:'));
        context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
      }
      process.exit(1);
    }
  });

program
  .command('create <branch-name>')
  .description('Create a new worktree with automatic port assignment, generates .env.worktree file')
  .option('--from <base-branch>', 'Create new branch from specified base branch (default: main branch)')
  .option('-v, --verbose', 'Show detailed creation process and next steps')
  .action(createCommand);

program
  .command('list')
  .description('List all worktrees with their branch names and port assignments')
  .option('-v, --verbose', 'Show detailed git status, running services, and file changes')
  .action(listCommand);

program
  .command('switch [worktree-name]')
  .description('Switch to a worktree by spawning a new shell with custom prompt and environment (auto-detects current worktree if run from within one)')
  .option('--no-shell', 'Just display worktree info without spawning a shell (old behavior)')
  .option('-v, --verbose', 'Show detailed information about the worktree')
  .addHelpText('after', '\nThe spawned shell will have:\n  - Custom prompt showing worktree name\n  - WT_WORKTREE and WT_WORKTREE_PATH environment variables\n  - Working directory set to the worktree\n  - Type "exit" to return to original directory\n\nIf no worktree-name is provided and you\'re inside a worktree, it will use the current worktree.')
  .action(switchCommand);

program
  .command('merge [worktree-name]')
  .description('Merge worktree branch to main with pre-merge safety checks and automatic backups (auto-detects current worktree if run from within one)')
  .option('-d, --delete', 'Delete worktree and branch after successful merge')
  .option('--no-delete', 'Prevent deletion even if autoCleanup is enabled')
  .option('--check', 'Preview merge and check for conflicts without actually merging')
  .option('--abort', 'Safely abort current merge with automatic backup')
  .option('-f, --force', 'Skip confirmation prompts')
  .option('-v, --verbose', 'Show detailed merge process information')
  .addHelpText('after', '\nSafety features:\n  - Checks for uncommitted changes\n  - Detects unpushed commits (offers to push)\n  - Creates automatic backup before merge\n  - Validates merge conflicts\n  - Cleans up port assignments on delete\n\nIf no worktree-name is provided and you\'re inside a worktree, it will use the current worktree.')
  .action((worktreeName, options) => {
    if (options.abort) {
      return mergeAbortCommand(options);
    }
    return mergeCommand(worktreeName, options);
  });

program
  .command('remove [worktree-name]')
  .description('Remove a worktree and release its assigned ports (auto-detects current worktree if run from within one)')
  .option('-f, --force', 'Force removal even with uncommitted changes (changes will be lost!)')
  .option('-v, --verbose', 'Show detailed removal process information')
  .addHelpText('after', '\nIf no worktree-name is provided and you\'re inside a worktree, it will use the current worktree.')
  .action(removeCommand);

program
  .command('ports [worktree-name]')
  .description('Display port assignments for all worktrees or a specific worktree (auto-detects current worktree if run from within one)')  
  .option('-v, --verbose', 'Show detailed port information')
  .addHelpText('after', '\nShows which ports are assigned to each service (vite, storybook, etc.)\nPort assignments persist across sessions\n\nIf no worktree-name is provided and you\'re inside a worktree, it will show ports for the current worktree.')
  .action(portsCommand);

// Conflicts command group
const conflictsCmd = program
  .command('conflicts')
  .description('Manage merge conflicts');

conflictsCmd
  .command('list')
  .description('Show all current conflicts')
  .option('-v, --verbose', 'Show detailed conflict information')
  .action(conflictsListCommand);

conflictsCmd
  .command('fix [file]')
  .description('Resolve conflicts interactively')
  .option('-i, --interactive', 'Interactive resolution mode (default)', true)
  .option('--tool <tool>', 'Use external merge tool (vscode, vim, meld, etc.)')
  .option('--auto-whitespace', 'Automatically resolve whitespace-only conflicts')
  .option('--whitespace-mode <mode>', 'Whitespace resolution mode: ours, theirs, normalize (default: normalize)')
  .action(conflictsFixCommand);

conflictsCmd
  .command('predict [branch]')
  .description('Predict potential conflicts before merge')
  .option('-v, --verbose', 'Show all conflict predictions including low risk')
  .option('--all-worktrees', 'Check for conflicts across all worktrees')
  .action(conflictsPredictCommand);

conflictsCmd
  .command('accept <side>')
  .description('Accept all conflicts from one side (ours/theirs)')
  .action(conflictsAcceptCommand);

// Recovery command group
const recoveryCmd = program
  .command('recovery')
  .description('Recover lost work');

recoveryCmd
  .command('find-commits')
  .description('Find recent work that might be lost')
  .option('--since <date>', 'Look for work since date (e.g., "2024-01-01", "7 days ago")')
  .option('--all', 'Show all commits including reachable ones')
  .option('-v, --verbose', 'Show older commits as well')
  .action(recoveryFindCommitsCommand);

recoveryCmd
  .command('restore <commit>')
  .description('Restore specific commit or work')
  .option('--create-branch', 'Create new branch for restored work')
  .action(recoveryRestoreCommand);

recoveryCmd
  .command('stash')
  .description('Find and restore from stashes')
  .action(recoveryStashCommand);

// Panic command
program
  .command('panic')
  .description('Emergency recovery - get help when things go wrong')
  .action(panicCommand);

// Restore command
program
  .command('restore')
  .description('Restore from merge backups')
  .option('--last-backup', 'Restore from the most recent backup')
  .option('--backup <id>', 'Restore specific backup by ID')
  .option('-v, --verbose', 'Show detailed information')
  .action(restoreCommand);

// Work management commands (user-friendly stash)
program
  .command('save-work')
  .description('Save your current uncommitted changes temporarily')
  .option('-m, --message <message>', 'Description of the work being saved')
  .action(saveWorkCommand);

program
  .command('restore-work')
  .description('Restore previously saved work')
  .option('-i, --index <number>', 'Restore specific saved work (0 = most recent)', parseInt)
  .option('-f, --force', 'Force restore even with uncommitted changes')
  .action(restoreWorkCommand);

// Stash command group
const stashCmd = program
  .command('stash')
  .description('Manage saved work');

stashCmd
  .command('list')
  .description('List all saved work')
  .action(listStashCommand);

// Help command
program
  .command('help [topic]')
  .description('Get help on specific topics')
  .option('-i, --interactive', 'Browse help topics interactively')
  .action(async (topic, options) => {
    if (topic && topic.trim()) {
      await helpSystem.showHelp(topic);
    } else if (options.interactive) {
      await helpSystem.browse();
    } else {
      helpSystem.showTopicList();
    }
  });

async function main() {
  try {
    // Skip config check for help and version commands
    const isHelpOrVersion = process.argv.some(arg => arg === '--help' || arg === '-h' || arg === '--version' || arg === '-V');
    const isHelpCommand = process.argv[2] === 'help';
    
    if (!isHelpOrVersion && !isHelpCommand) {
      const configExists = await config.exists();
      if (!configExists && process.argv[2] !== 'init') {
        // Check if we're in a git repository at all
        try {
          const rootFinder = require('./lib/rootFinder');
          await rootFinder.findGitRoot();
          // We're in a git repo but no config
          console.log(chalk.yellow('No worktree configuration found in this repository.'));
          console.log(chalk.gray('Run "wt init" to initialize worktree support.'));
          console.log(chalk.gray('Run "wt help" to learn more about the Git Worktree Tool.'));
        } catch {
          // Not in a git repository
          console.log(chalk.yellow('This command must be run inside a git repository.'));
          console.log(chalk.gray('Initialize a git repository first with "git init"'));
          console.log(chalk.gray('Then run "wt init" to set up worktree support.'));
        }
        process.exit(1);
      }
    }
    
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

main();