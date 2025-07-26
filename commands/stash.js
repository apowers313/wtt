const chalk = require('chalk');
const config = require('../lib/config');
const gitOps = require('../lib/gitOps');
const MessageFormatter = require('../lib/merge-helper/message-formatter');
const OutputConfig = require('../lib/output-config');
const { addCommandContext } = require('../lib/errorTranslator');

/**
 * Save work command - User-friendly wrapper around git stash
 * Implements the design from merge-helper-design.md
 */
async function saveWorkCommand(options = {}) {
  const messageFormatter = new MessageFormatter();
  
  try {
    await gitOps.validateRepository();
    await config.load();
    
    // Ensure git is initialized
    const git = await gitOps.ensureGit();
    
    // Check if there are changes to save
    const status = await git.status();
    const hasChanges = status.files.length > 0;
    
    if (!hasChanges) {
      console.log(chalk.yellow('No uncommitted changes to save.'));
      return;
    }
    
    // Create a descriptive stash message
    const timestamp = new Date().toLocaleString();
    const defaultMessage = `Work in progress - ${timestamp}`;
    const message = options.message || defaultMessage;
    
    if (OutputConfig.isVerbose()) {
      console.log(chalk.blue('Saving your current work...'));
      console.log(chalk.gray(`Files to be saved: ${status.files.length}`));
      status.files.forEach(file => {
        const icon = file.index === 'M' ? '✏️' : 
          file.index === 'A' ? '➕' : 
            file.index === 'D' ? '🗑️' : '📄';
        console.log(chalk.gray(`  ${icon} ${file.path}`));
      });
    }
    
    // Save the work
    await git.stash(['push', '-m', message]);
    
    console.log(chalk.green('✅ Work saved successfully!'));
    if (OutputConfig.isVerbose()) {
      console.log(chalk.gray('\nYour changes are safely stored and can be restored with:'));
      console.log(chalk.cyan('  wt restore-work'));
      console.log(chalk.gray('\nTo see all saved work:'));
      console.log(chalk.cyan('  wt stash list'));
    }
    
  } catch (error) {
    const errorLevel = process.env.WTT_ERROR_LEVEL || 'enhanced';
    
    if (errorLevel === 'simple') {
      console.error('Error:', error.message);
    } else {
      const formattedError = messageFormatter.formatStashError(error);
      messageFormatter.displayFormattedError(formattedError, { verbose: options.verbose });
    }
    
    process.exit(1);
  }
}

/**
 * Restore work command - User-friendly wrapper around git stash pop
 */
async function restoreWorkCommand(options = {}) {
  const messageFormatter = new MessageFormatter();
  
  try {
    await gitOps.validateRepository();
    await config.load();
    
    // Ensure git is initialized
    const git = await gitOps.ensureGit();
    
    // Check if there are stashes to restore
    const stashList = await git.stashList();
    
    if (!stashList || stashList.total === 0) {
      console.log(chalk.yellow('No saved work to restore.'));
      console.log(chalk.gray('\nTo save your current work, use:'));
      console.log(chalk.cyan('  wt save-work'));
      return;
    }
    
    // Check for uncommitted changes that might conflict
    const status = await git.status();
    const hasChanges = status.files.length > 0;
    
    if (hasChanges && !options.force) {
      console.log(chalk.yellow('⚠️  You have uncommitted changes that might conflict with the saved work.'));
      console.log(chalk.gray('\nOptions:'));
      console.log(chalk.cyan('  1. Save current work first:'));
      console.log(chalk.gray('     wt save-work'));
      console.log(chalk.cyan('  2. Force restore (may cause conflicts):'));
      console.log(chalk.gray('     wt restore-work --force'));
      return;
    }
    
    if (OutputConfig.isVerbose()) {
      console.log(chalk.blue('Restoring your saved work...'));
      const latestStash = stashList.latest;
      if (latestStash) {
        console.log(chalk.gray(`\nRestoring: ${latestStash.message}`));
        console.log(chalk.gray(`Saved: ${latestStash.date}`));
      }
    }
    
    // Restore the work
    const stashIndex = options.index || 0;
    await git.stash(['pop', `stash@{${stashIndex}}`]);
    
    console.log(chalk.green('✅ Work restored successfully!'));
    
    // Check if there were conflicts
    const postStatus = await git.status();
    if (postStatus.conflicted.length > 0) {
      console.log(chalk.yellow('\n⚠️  Some files have conflicts that need resolution:'));
      postStatus.conflicted.forEach(file => {
        console.log(chalk.yellow(`  • ${file}`));
      });
      console.log(chalk.gray('\nTo resolve conflicts:'));
      console.log(chalk.cyan('  wt conflicts fix'));
    }
    
  } catch (error) {
    // Check if it's a merge conflict during stash pop
    if (error.message.includes('conflict')) {
      console.log(chalk.red('❌ Could not restore work due to conflicts'));
      console.log(chalk.yellow('\nYour saved work conflicts with current changes.'));
      console.log(chalk.gray('\nOptions:'));
      console.log(chalk.cyan('  1. Resolve conflicts manually:'));
      console.log(chalk.gray('     wt conflicts fix'));
      console.log(chalk.cyan('  2. Cancel the restore:'));
      console.log(chalk.gray('     git stash drop'));
      console.log(chalk.cyan('  3. Try applying without removing from stash:'));
      console.log(chalk.gray('     git stash apply'));
    } else {
      const errorLevel = process.env.WTT_ERROR_LEVEL || 'enhanced';
      
      if (errorLevel === 'simple') {
        console.error('Error:', error.message);
      } else {
        const formattedError = messageFormatter.formatStashError(error);
        messageFormatter.displayFormattedError(formattedError, { verbose: options.verbose });
      }
    }
    
    process.exit(1);
  }
}

/**
 * List saved work command - User-friendly wrapper around git stash list
 */
async function listStashCommand() {
  try {
    await gitOps.validateRepository();
    
    // Ensure git is initialized
    const git = await gitOps.ensureGit();
    
    const stashList = await git.stashList();
    
    if (!stashList || stashList.total === 0) {
      console.log(chalk.gray('No saved work found.'));
      console.log(chalk.gray('\nTo save your current work:'));
      console.log(chalk.cyan('  wt save-work'));
      return;
    }
    
    console.log(chalk.bold('\nSaved Work:\n'));
    
    if (stashList.all && stashList.all.length > 0) {
      stashList.all.forEach((stash, index) => {
        const icon = index === 0 ? '🕐' : '🕑';
        console.log(`${icon} ${chalk.cyan(`stash@{${index}}`)} - ${stash.message}`);
        console.log(chalk.gray(`   Saved: ${stash.date}`));
        if (stash.branch) {
          console.log(chalk.gray(`   Branch: ${stash.branch}`));
        }
        console.log();
      });
    }
    
    console.log(chalk.gray('To restore saved work:'));
    console.log(chalk.cyan('  wt restore-work           # Restore most recent'));
    console.log(chalk.cyan('  wt restore-work --index=1 # Restore specific save'));
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    const context = addCommandContext(error.message, 'stash list');
    if (context.tips && context.tips.length > 0) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

module.exports = {
  saveWorkCommand,
  restoreWorkCommand,
  listStashCommand
};