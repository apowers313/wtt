const chalk = require('chalk');
const inquirer = require('inquirer');
const config = require('../lib/config');
const gitOps = require('../lib/gitOps');
const BackupManager = require('../lib/merge-helper/backup-manager');
const MessageFormatter = require('../lib/merge-helper/message-formatter');
const OutputConfig = require('../lib/output-config');
const ProgressUI = require('../lib/ui/progress-ui');

/**
 * Safe merge abort command - Aborts a merge while preserving backups
 * Implements the design from merge-helper-design.md
 */
async function mergeAbortCommand(options = {}) {
  const messageFormatter = new MessageFormatter();
  
  try {
    await gitOps.validateRepository();
    await config.load();
    
    const git = await gitOps.ensureGit();
    const backupManager = new BackupManager(config.getBaseDir());
    
    // Check if there's actually a merge in progress
    const status = await git.status();
    if (!status.merging && !status.merge && (!status.conflicted || status.conflicted.length === 0)) {
      console.log(chalk.yellow('⚠️  No merge in progress'));
      return;
    }
    
    // Show merge status
    if (status.conflicted && status.conflicted.length > 0) {
      console.log(chalk.blue(`🔄 Aborting merge with ${status.conflicted.length} conflicted file(s)...`));
    } else {
      console.log(chalk.blue('\n🛑 Aborting merge...\n'));
    }
    
    // Show what will happen
    if (OutputConfig.isVerbose()) {
      console.log(chalk.gray('This will:'));
      console.log(chalk.gray('  1. Create a safety backup of current state'));
      console.log(chalk.gray('  2. Abort the merge, returning to pre-merge state'));
      console.log(chalk.gray('  3. Preserve all merge-related backups for recovery'));
    }
    
    // Confirm if not forced
    if (!options.force && !options.yes) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Abort the current merge?',
        default: true
      }]);
      
      if (!confirm) {
        console.log(chalk.yellow('Merge abort cancelled.'));
        return;
      }
    }
    
    // Create a backup before aborting
    const spinner = ProgressUI.createSpinner('Creating safety backup before abort...');
    spinner.start();
    
    let backup;
    try {
      const metadata = { reason: 'User requested merge abort' };
      if (options.force) {
        metadata.force = true;
      }
      
      backup = await backupManager.createSafetyBackup('merge-abort', {
        metadata
      });
      
      spinner.stop('Backup created successfully');
      if (backup && backup.id) {
        console.log(chalk.gray(`   Backup saved: ${backup.id}`));
      }
      
      if (OutputConfig.isVerbose() && backup && backup.id) {
        console.log(chalk.gray(`Backup ID: ${backup.id}`));
      }
      
    } catch (error) {
      spinner.fail('Failed to create backup');
      console.log(chalk.yellow('⚠️  Warning: Could not create backup:'), error.message);
      
      const { proceedWithoutBackup } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceedWithoutBackup',
        message: 'Continue aborting merge without backup?',
        default: false
      }]);
      
      if (!proceedWithoutBackup) {
        console.log(chalk.yellow('Merge abort cancelled.'));
        return;
      }
    }
    
    // Perform the actual merge abort
    const abortSpinner = ProgressUI.createSpinner('Aborting merge...');
    abortSpinner.start();
    
    try {
      await git.merge(['--abort']);
      abortSpinner.stop('Merge aborted successfully');
      
      console.log(chalk.green('✅ Merge aborted successfully'));
      console.log(chalk.gray('You are back to the state before the merge started.'));
      
      // List recent backups for reference
      const backups = await backupManager.listBackups();
      const mergeBackups = backups.filter(b => 
        b.operation === 'merge' || b.operation === 'merge-abort'
      ).slice(0, 3);
      
      if (mergeBackups.length > 0) {
        console.log(chalk.blue('\n📦 Recent merge-related backups:'));
        mergeBackups.forEach(backup => {
          const date = new Date(backup.timestamp);
          const timeAgo = getRelativeTime(date);
          console.log(chalk.gray(`  - ${backup.id} (${timeAgo})`));
        });
        
        console.log(chalk.cyan('\n💡 To restore any backup:'));
        console.log(chalk.gray('   wt restore --backup <backup-id>'));
      }
      
    } catch (error) {
      abortSpinner.fail('Failed to abort merge');
      console.error(chalk.red('❌ Failed to abort merge:'), error.message);
      
      // If we had a successful backup, let user know
      if (typeof backup !== 'undefined' && backup && backup.id) {
        console.log(chalk.yellow(`💾 Your changes are backed up with ID: ${backup.id}`));
      }
      
      throw error;
    }
    
  } catch (error) {
    const errorLevel = process.env.WTT_ERROR_LEVEL || 'enhanced';
    
    if (errorLevel === 'simple') {
      console.error(chalk.red('❌ Failed to check merge status:'), error.message);
    } else {
      const formattedError = messageFormatter.formatError(error, {
        operation: 'merge abort',
        userSkill: 'beginner'
      });
      messageFormatter.displayFormattedError(formattedError, { verbose: options.verbose });
    }
    
    process.exit(1);
  }
}

/**
 * Get relative time string
 */
function getRelativeTime(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

module.exports = {
  mergeAbortCommand
};