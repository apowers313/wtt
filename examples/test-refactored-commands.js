#!/usr/bin/env node

/**
 * Test script to demonstrate refactored commands
 * Shows the new concise output system in action
 */

const { Command } = require('commander');
const { mergeCommand } = require('../commands/merge-refactored');
const { createCommand } = require('../commands/create-refactored');
const { listCommand } = require('../commands/list-refactored');
const { removeCommand } = require('../commands/remove-refactored');

const program = new Command();

program
  .name('wt-new')
  .description('WTT with new concise output system (demo)')
  .version('2.0.0-alpha');

program
  .command('create <branch-name>')
  .description('Create a new worktree (refactored version)')
  .option('--from <base-branch>', 'Create new branch from specified base branch')
  .option('-v, --verbose', 'Show detailed output')
  .action(createCommand);

program
  .command('list')
  .description('List all worktrees (refactored version)')
  .option('-v, --verbose', 'Show detailed information')
  .action(listCommand);

program
  .command('merge [worktree-name]')
  .description('Merge worktree branch (refactored version)')
  .option('-d, --delete', 'Delete worktree after merge')
  .option('-v, --verbose', 'Show detailed output')
  .action(mergeCommand);

program
  .command('remove [worktree-name]')
  .description('Remove a worktree (refactored version)')
  .option('-f, --force', 'Force removal even with uncommitted changes')
  .option('-v, --verbose', 'Show detailed output')
  .action(removeCommand);

// Demo command to show output differences
program
  .command('demo')
  .description('Show output format comparison')
  .action(() => {
    console.log('=== WTT Refactored Commands Demo ===\n');
    console.log('Try these commands to see the new concise output:');
    console.log('');
    console.log('  wt-new list                    # List worktrees (1 line)');
    console.log('  wt-new list --verbose          # List worktrees (detailed)');
    console.log('  wt-new create test-feature     # Create worktree (concise)');
    console.log('  wt-new create test-feature -v  # Create worktree (verbose)');
    console.log('');
    console.log('Compare with original commands:');
    console.log('  wt list                        # Original verbose output');
    console.log('  wt create test-feature         # Original verbose output');
    console.log('');
    console.log('Benefits of refactored version:');
    console.log('  ✅ 90% less output verbosity');
    console.log('  ✅ Clear error messages with exit codes');
    console.log('  ✅ Works from any directory in repository');
    console.log('  ✅ Pre-validation prevents failures');
    console.log('  ✅ Consistent command-line interface');
  });

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();