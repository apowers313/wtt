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

const program = new Command();

program
  .name('wt')
  .description('Git Worktree Tool - Streamline git worktree workflows with automatic port management')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize worktree configuration for the repository')
  .action(async () => {
    try {
      const configExists = await config.exists();
      await config.init();
      if (configExists) {
        console.log(chalk.yellow('✓ Configuration already exists'));
      } else {
        console.log(chalk.green('✓ Initialized worktree configuration'));
      }
    } catch (error) {
      console.error(chalk.red('Error initializing configuration:'), error.message);
      process.exit(1);
    }
  });

program
  .command('create <branch-name>')
  .description('Create a new worktree with automatic port assignment')
  .option('--from <base-branch>', 'Create branch from specified base branch')
  .action(createCommand);

program
  .command('list')
  .description('List all worktrees with status information')
  .option('-v, --verbose', 'Show detailed information')
  .action(listCommand);

program
  .command('switch <worktree-name>')
  .description('Switch to a worktree directory and show port information')
  .action(switchCommand);

program
  .command('merge <worktree-name>')
  .description('Merge worktree branch to main and optionally clean up')
  .option('-d, --delete', 'Delete worktree and branch after merge')
  .action(mergeCommand);

program
  .command('remove <worktree-name>')
  .description('Remove a worktree and clean up port assignments')
  .option('-f, --force', 'Force removal even with uncommitted changes')
  .action(removeCommand);

program
  .command('ports [worktree-name]')
  .description('Show port assignments for worktree(s)')
  .action(portsCommand);

async function main() {
  try {
    // Skip config check for help and version commands
    const isHelpOrVersion = process.argv.some(arg => arg === '--help' || arg === '-h' || arg === '--version' || arg === '-V');
    
    if (!isHelpOrVersion) {
      const configExists = await config.exists();
      if (!configExists && process.argv[2] !== 'init') {
        console.log(chalk.yellow('No worktree configuration found. Run "wt init" to initialize.'));
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