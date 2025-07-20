#!/usr/bin/env node

const { Command } = require('commander');
const { removeCommand } = require('./commands/remove-refactored');

const program = new Command();

program
  .name('wt')
  .description('Git Worktree Tool')
  .version('1.0.0');

program
  .command('remove <worktree>')
  .description('Remove a worktree')
  .option('-f, --force', 'Force removal without confirmation')
  .action(async (worktreeName, options) => {
    // In production, use default prompter
    await removeCommand(worktreeName, options);
  });

// Export for testing
module.exports = { program, removeCommand };

if (require.main === module) {
  program.parse();
}