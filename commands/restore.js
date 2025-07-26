const chalk = require('chalk');
const inquirer = require('inquirer');
const config = require('../lib/config');
const gitOps = require('../lib/gitOps');
const BackupManager = require('../lib/merge-helper/backup-manager');
const MessageFormatter = require('../lib/merge-helper/message-formatter');
const OutputConfig = require('../lib/output-config');
const ProgressUI = require('../lib/ui/progress-ui');
// fs and path are imported but not used in this file

/**
 * Restore command - Restore from merge backups
 * Implements the design from merge-helper-design.md
 */
async function restoreCommand(options = {}) {
  const messageFormatter = new MessageFormatter();
  
  try {
    await gitOps.validateRepository();
    await config.load();
    
    const backupManager = new BackupManager(config.getBaseDir());
    
    // If --last-backup flag is used, restore the most recent backup
    if (options.lastBackup) {
      await restoreLastBackup(backupManager, options);
      return;
    }
    
    // If backup ID is provided, restore that specific backup
    if (options.backup) {
      await restoreSpecificBackup(backupManager, options.backup, options);
      return;
    }
    
    // Otherwise, show interactive backup selection
    await interactiveRestore(backupManager, options);
    
  } catch (error) {
    const errorLevel = process.env.WTT_ERROR_LEVEL || 'enhanced';
    
    if (errorLevel === 'simple') {
      if (error.message.includes('Cannot read backup directory')) {
        console.error(chalk.red('❌ Failed to list backups:'), error.message);
      } else {
        console.error(chalk.red('❌ Restoration failed:'), error.message);
      }
    } else {
      const formattedError = messageFormatter.formatError(error, {
        operation: 'restore',
        userSkill: 'beginner'
      });
      messageFormatter.displayFormattedError(formattedError, { verbose: options.verbose });
    }
    
    process.exit(1);
  }
}

/**
 * Restore the most recent backup
 */
async function restoreLastBackup(backupManager, options = {}) {
  const backups = await backupManager.listBackups();
  
  if (backups.length === 0) {
    console.log(chalk.yellow('⚠️  No backups found'));
    console.log(chalk.gray('\nBackups are created automatically during merge operations.'));
    console.log(chalk.gray('You can also create manual backups with:'));
    console.log(chalk.cyan('  wt backup create'));
    return;
  }
  
  // Get the most recent backup
  const lastBackup = backups[0];
  
  console.log(chalk.blue(`\nRestoring from last backup: ${lastBackup.id}`));
  console.log(chalk.gray(`Created: ${new Date(lastBackup.timestamp).toLocaleString()}`));
  console.log(chalk.gray(`Branch: ${lastBackup.branch}`));
  console.log(chalk.gray(`Operation: ${lastBackup.operation || 'manual'}`));
  
  // Confirm restoration
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'This will restore your working directory to the backup state. Continue?',
    default: true
  }]);
  
  if (!confirm) {
    console.log(chalk.yellow('Restoration cancelled.'));
    return;
  }
  
  await performRestore(backupManager, lastBackup, options);
}

/**
 * Restore a specific backup by ID
 */
async function restoreSpecificBackup(backupManager, backupId, options = {}) {
  let backup;
  try {
    const backups = await backupManager.listBackups();
    backup = backups.find(b => b.id === backupId || b.id.startsWith(backupId));
  } catch (error) {
    // If we can't list backups, try to restore directly
    backup = { id: backupId };
  }
  
  if (!backup) {
    throw new Error(`Backup '${backupId}' not found`);
  }
  
  console.log(chalk.blue(`\nRestoring backup: ${backup.id}`));
  if (backup.timestamp) {
    console.log(chalk.gray(`Created: ${new Date(backup.timestamp).toLocaleString()}`));
  }
  if (backup.branch) {
    console.log(chalk.gray(`Branch: ${backup.branch}`));
  }
  if (backup.operation) {
    console.log(chalk.gray(`Operation: ${backup.operation || 'manual'}`));
  }
  
  await performRestore(backupManager, backup, options);
  
  // Show detailed backup info after restoration
  if (backup.commit) {
    console.log(chalk.gray(`   Branch: ${backup.branch}`));
    console.log(chalk.gray(`   Commit: ${backup.commit}`));
    console.log(chalk.gray(`   Operation: ${backup.operation || 'manual'}`));
  }
  
}

/**
 * Interactive backup selection and restoration
 */
async function interactiveRestore(backupManager, options = {}) {
  const backups = await backupManager.listBackups();
  
  if (backups.length === 0) {
    console.log(chalk.yellow('⚠️  No backups found'));
    console.log(chalk.gray('\nBackups are created automatically during merge operations.'));
    return;
  }
  
  // Format backup list
  const messageFormatter = new MessageFormatter();
  messageFormatter.formatBackupList(backups);
  
  console.log(chalk.blue('\nAvailable backups:\n'));
  
  // Format backups for display
  const choices = backups.slice(0, 10).map(backup => {
    const date = new Date(backup.timestamp);
    const timeAgo = getRelativeTime(date);
    const operation = backup.operation || 'manual';
    
    // Build name with branch and commit info if available
    let name = `${operation}`;
    if (backup.branch) {
      name += ` (${backup.branch}`;
      if (backup.commit) {
        name += ` - ${backup.commit.substring(0, 7)}`;
      }
      name += ')';
    }
    name += ` - ${timeAgo}`;
    
    return {
      name,
      value: backup.id,
      short: backup.id
    };
  });
  
  choices.push({ name: 'Cancel', value: null });
  
  const { selectedBackup } = await inquirer.prompt([{
    type: 'list',
    name: 'selectedBackup',
    message: 'Select a backup to restore:',
    choices,
    pageSize: 10
  }]);
  
  if (!selectedBackup) {
    console.log(chalk.yellow('Restoration cancelled.'));
    return;
  }
  
  // Find the backup object from the ID
  const backup = backups.find(b => b.id === selectedBackup);
  if (!backup) {
    throw new Error(`Backup '${selectedBackup}' not found`);
  }
  
  // Show backup details
  console.log(chalk.blue('\nBackup details:'));
  console.log(chalk.gray(`ID: ${backup.id}`));
  console.log(chalk.gray(`Created: ${new Date(backup.timestamp).toLocaleString()}`));
  console.log(chalk.gray(`Branch: ${backup.branch}`));
  console.log(chalk.gray(`Operation: ${backup.operation || 'manual'}`));
  
  if (backup.filesCount) {
    console.log(chalk.gray(`Files: ${backup.filesCount}`));
  }
  
  // Directly restore without additional confirmation since user already selected
  await performRestore(backupManager, backup, options);
}

/**
 * Perform the actual restoration
 */
async function performRestore(backupManager, backup, options = {}) {
  const spinner = ProgressUI.createSpinner('Restoring from backup...');
  spinner.start();
  
  try {
    // Check for uncommitted changes
    const hasChanges = await gitOps.hasUncommittedChanges();
    if (hasChanges) {
      spinner.fail('Cannot restore with uncommitted changes');
      console.log(chalk.yellow('\n⚠️  You have uncommitted changes.'));
      console.log(chalk.gray('\nOptions:'));
      console.log(chalk.cyan('  1. Save your changes:'));
      console.log(chalk.gray('     wt save-work'));
      console.log(chalk.cyan('  2. Commit your changes:'));
      console.log(chalk.gray('     git commit -am "Work in progress"'));
      console.log(chalk.cyan('  3. Discard your changes (careful!):'));
      console.log(chalk.gray('     git reset --hard'));
      return;
    }
    
    // Restore the backup
    const restoreOptions = { keepChanges: options.keepChanges || false };
    await backupManager.restoreFromBackup(backup.id, restoreOptions);
    
    spinner.stop('Backup restored successfully!');
    
    console.log(chalk.green('✅ Successfully restored from backup'));
    console.log(chalk.gray(`Your working directory has been restored to the state from ${backup.id}`));
    
    if (OutputConfig.isVerbose()) {
      console.log(chalk.blue('\n📝 Next steps:'));
      console.log(chalk.gray('  - Check your restored files with: git status'));
      console.log(chalk.gray('  - If you need to undo this restoration, the current state was backed up'));
    }
    
    // Ask if user wants to delete the backup after restoration (only for specific backup restoration)
    if (options.backup) {
      const { deleteBackup } = await inquirer.prompt([{
        type: 'confirm',
        name: 'deleteBackup',
        message: 'Delete this backup after restoration?',
        default: false
      }]);
      
      if (deleteBackup) {
        try {
          await backupManager.deleteBackup(backup.id);
          console.log(chalk.gray('   Backup deleted'));
        } catch (error) {
          console.log(chalk.yellow('   Warning: Could not delete backup:'), error.message);
        }
      }
    }
    
  } catch (error) {
    spinner.fail('Restoration failed');
    throw error;
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
  restoreCommand
};