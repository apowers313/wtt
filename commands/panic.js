const chalk = require('chalk');
const inquirer = require('inquirer');
const BackupManager = require('../lib/merge-helper/backup-manager');
const config = require('../lib/config');
const gitOps = require('../lib/gitOps');
const { simpleGit } = require('simple-git');

async function panicCommand() {
  console.log(chalk.yellow.bold('\n🚨 Emergency Mode - Let\'s fix this step by step\n'));
  console.log(chalk.cyan('Don\'t worry! Your work is safe and we can recover from this.\n'));
  
  try {
    await gitOps.validateRepository();
    await config.load();
    
    const situation = await inquirer.prompt([{
      type: 'list',
      name: 'problem',
      message: 'What went wrong?',
      choices: [
        { name: 'Merge has conflicts I don\'t understand', value: 'merge-conflicts' },
        { name: 'I think I lost some work', value: 'lost-work' },
        { name: 'Everything looks broken', value: 'broken' },
        { name: 'I want to start over', value: 'start-over' },
        { name: 'Merge failed and I don\'t know what to do', value: 'merge-failed' },
        { name: 'I accidentally deleted something', value: 'deleted' },
        { name: 'Something else', value: 'other' }
      ]
    }]);
    
    await handleSituation(situation.problem);
    
  } catch (error) {
    console.error(chalk.red('\nError in panic mode:'), error.message);
    console.log(chalk.yellow('\nIf you\'re still stuck, try these commands:'));
    console.log(chalk.gray('  git status           # See current state'));
    console.log(chalk.gray('  wt help merge        # Get merge help'));
    console.log(chalk.gray('  wt recovery find     # Find lost work'));
  }
}

async function handleSituation(problem) {
  switch (problem) {
  case 'merge-conflicts':
    await handleMergeConflicts();
    break;
    
  case 'lost-work':
    await handleLostWork();
    break;
    
  case 'broken':
    await handleBrokenState();
    break;
    
  case 'start-over':
    await handleStartOver();
    break;
    
  case 'merge-failed':
    await handleFailedMerge();
    break;
    
  case 'deleted':
    await handleAccidentalDeletion();
    break;
    
  case 'other':
    await handleOther();
    break;
  }
}

async function handleMergeConflicts() {
  console.log(chalk.blue('\n📋 Let\'s check your merge conflicts...\n'));
  
  const git = simpleGit();
  const status = await git.status();
  
  if (status.conflicted.length === 0) {
    console.log(chalk.green('✅ Good news! No conflicts found.'));
    console.log(chalk.gray('Your merge might have already been resolved.'));
    return;
  }
  
  console.log(chalk.yellow(`Found ${status.conflicted.length} file(s) with conflicts:\n`));
  status.conflicted.forEach(file => {
    console.log(chalk.red(`  ❌ ${file}`));
  });
  
  const action = await inquirer.prompt([{
    type: 'list',
    name: 'choice',
    message: 'What would you like to do?',
    choices: [
      { name: 'Resolve conflicts step by step', value: 'resolve' },
      { name: 'Cancel this merge and go back', value: 'abort' },
      { name: 'See what the conflicts look like', value: 'preview' },
      { name: 'Get more help', value: 'help' }
    ]
  }]);
  
  switch (action.choice) {
  case 'resolve':
    console.log(chalk.cyan('\n💡 Running conflict resolver...'));
    console.log(chalk.gray('Run: wt conflicts fix --interactive'));
    break;
    
  case 'abort':
    console.log(chalk.yellow('\n🔄 Canceling the merge...'));
    await git.merge(['--abort']);
    console.log(chalk.green('✅ Merge cancelled! You\'re back to where you started.'));
    break;
    
  case 'preview':
    console.log(chalk.cyan('\n💡 To see conflicts in detail:'));
    console.log(chalk.gray('Run: wt conflicts list --verbose'));
    break;
    
  case 'help':
    console.log(chalk.cyan('\n📚 Merge conflicts happen when:'));
    console.log(chalk.gray('- Two people change the same line of code differently'));
    console.log(chalk.gray('- One person deletes a file another person modified'));
    console.log(chalk.gray('\nYou need to choose which changes to keep.'));
    break;
  }
}

async function handleLostWork() {
  console.log(chalk.blue('\n🔍 Let\'s find your lost work...\n'));
  
  const backupManager = new BackupManager(config.getBaseDir());
  
  // Check for recent backups
  const backupDir = backupManager.backupDir;
  const fs = require('fs-extra');
  
  let backups = [];
  if (await fs.pathExists(backupDir)) {
    const files = await fs.readdir(backupDir);
    backups = files.filter(f => f.startsWith('merge-') || f.startsWith('operation-'));
  }
  
  if (backups.length > 0) {
    console.log(chalk.green(`✅ Found ${backups.length} backup(s):\n`));
    
    // Show last 5 backups
    const recentBackups = backups.slice(-5).reverse();
    for (const backup of recentBackups) {
      const backupInfo = await fs.readJSON(`${backupDir}/${backup}/backup-info.json`).catch(() => null);
      if (backupInfo) {
        const date = new Date(backupInfo.timestamp).toLocaleString();
        console.log(chalk.cyan(`  📁 ${backup}`));
        console.log(chalk.gray(`     Created: ${date}`));
        console.log(chalk.gray(`     Branch: ${backupInfo.branch}`));
      }
    }
    
    console.log(chalk.yellow('\n💡 To restore from a backup:'));
    console.log(chalk.gray('   wt restore --backup <backup-id>'));
  }
  
  // Also check git reflog
  console.log(chalk.blue('\n🔍 Checking git history...\n'));
  console.log(chalk.cyan('💡 To see recent commits (including "lost" ones):'));
  console.log(chalk.gray('   wt recovery find-commits'));
  console.log(chalk.gray('   git reflog'));
}

async function handleBrokenState() {
  console.log(chalk.blue('\n🔧 Let\'s diagnose what\'s wrong...\n'));
  
  const git = simpleGit();
  const status = await git.status();
  
  console.log(chalk.cyan('Current state:'));
  console.log(chalk.gray(`  Branch: ${status.current || 'unknown'}`));
  console.log(chalk.gray(`  Modified files: ${status.modified.length}`));
  console.log(chalk.gray(`  Conflicted files: ${status.conflicted.length}`));
  console.log(chalk.gray(`  Untracked files: ${status.not_added.length}`));
  
  if (status.conflicted.length > 0) {
    console.log(chalk.yellow('\n⚠️  You have unresolved conflicts.'));
    console.log(chalk.cyan('Fix with: wt conflicts fix'));
  }
  
  const action = await inquirer.prompt([{
    type: 'list',
    name: 'choice',
    message: 'What would you like to do?',
    choices: [
      { name: 'Save current state and start fresh', value: 'save-and-reset' },
      { name: 'Just show me what changed', value: 'show-changes' },
      { name: 'Restore from last backup', value: 'restore-backup' },
      { name: 'Get more help', value: 'help' }
    ]
  }]);
  
  switch (action.choice) {
  case 'save-and-reset': {
    const backupManager = new BackupManager(config.getBaseDir());
    const backup = await backupManager.createSafetyBackup('panic-save');
    console.log(chalk.green('\n✅ Your work has been saved!'));
    console.log(chalk.gray(`Backup ID: ${backup.id}`));
    console.log(chalk.yellow('\n💡 To go back to a clean state:'));
    console.log(chalk.gray('   git reset --hard HEAD'));
    break;
  }
    
  case 'show-changes':
    console.log(chalk.cyan('\n💡 To see what changed:'));
    console.log(chalk.gray('   git status          # Overview'));
    console.log(chalk.gray('   git diff            # Detailed changes'));
    break;
    
  case 'restore-backup':
    console.log(chalk.cyan('\n💡 To restore from backup:'));
    console.log(chalk.gray('   wt restore --last-backup'));
    break;
  }
}

async function handleStartOver() {
  console.log(chalk.yellow('\n⚠️  Starting over will reset your current work.\n'));
  
  const backupManager = new BackupManager(config.getBaseDir());
  
  const confirm = await inquirer.prompt([{
    type: 'confirm',
    name: 'proceed',
    message: 'Create a backup before starting over?',
    default: true
  }]);
  
  if (confirm.proceed) {
    const backup = await backupManager.createSafetyBackup('start-over');
    console.log(chalk.green('✅ Backup created!'));
    console.log(chalk.gray(`Backup ID: ${backup.id}`));
  }
  
  const action = await inquirer.prompt([{
    type: 'list',
    name: 'choice',
    message: 'How would you like to start over?',
    choices: [
      { name: 'Reset to last commit (lose uncommitted changes)', value: 'reset-hard' },
      { name: 'Reset but keep changes as uncommitted', value: 'reset-soft' },
      { name: 'Cancel merge if one is in progress', value: 'merge-abort' },
      { name: 'Actually, I changed my mind', value: 'cancel' }
    ]
  }]);
  
  const git = simpleGit();
  
  switch (action.choice) {
  case 'reset-hard':
    await git.reset(['--hard', 'HEAD']);
    console.log(chalk.green('✅ Reset complete! You have a clean slate.'));
    break;
    
  case 'reset-soft':
    await git.reset(['HEAD']);
    console.log(chalk.green('✅ Reset complete! Your changes are preserved as uncommitted.'));
    break;
    
  case 'merge-abort':
    try {
      await git.merge(['--abort']);
      console.log(chalk.green('✅ Merge cancelled!'));
    } catch (error) {
      console.log(chalk.yellow('No merge in progress.'));
    }
    break;
  }
}

async function handleFailedMerge() {
  console.log(chalk.blue('\n🔍 Checking merge status...\n'));
  
  const git = simpleGit();
  const status = await git.status();
  
  if (status.conflicted.length > 0) {
    await handleMergeConflicts();
  } else {
    console.log(chalk.yellow('No active merge found.'));
    console.log(chalk.cyan('\n💡 If a merge failed earlier:'));
    console.log(chalk.gray('   wt recovery find-commits  # Find recent work'));
    console.log(chalk.gray('   wt merge <branch> --check # Preview merge'));
  }
}

async function handleAccidentalDeletion() {
  console.log(chalk.blue('\n🔍 Looking for deleted files...\n'));
  
  const git = simpleGit();
  const status = await git.status();
  
  if (status.deleted.length > 0) {
    console.log(chalk.yellow(`Found ${status.deleted.length} deleted file(s):\n`));
    status.deleted.forEach(file => {
      console.log(chalk.red(`  ❌ ${file}`));
    });
    
    console.log(chalk.cyan('\n💡 To restore deleted files:'));
    console.log(chalk.gray('   git checkout -- <filename>   # Restore specific file'));
    console.log(chalk.gray('   git checkout -- .            # Restore all deleted files'));
  } else {
    console.log(chalk.green('✅ No deleted files in current changes.'));
    console.log(chalk.cyan('\n💡 To find files deleted in past commits:'));
    console.log(chalk.gray('   git log --diff-filter=D --summary'));
  }
}

async function handleOther() {
  console.log(chalk.cyan('\n📚 Here are some helpful commands:\n'));
  
  console.log(chalk.blue('Check current state:'));
  console.log(chalk.gray('  git status                # See what\'s happening'));
  console.log(chalk.gray('  wt list                   # See all worktrees'));
  
  console.log(chalk.blue('\nFix common issues:'));
  console.log(chalk.gray('  wt conflicts fix          # Resolve merge conflicts'));
  console.log(chalk.gray('  wt recovery find-commits  # Find lost work'));
  console.log(chalk.gray('  wt restore --last-backup  # Restore from backup'));
  
  console.log(chalk.blue('\nGet help:'));
  console.log(chalk.gray('  wt help merge             # Merge help'));
  console.log(chalk.gray('  wt help recovery          # Recovery help'));
  
  console.log(chalk.yellow('\n💡 Still stuck? Please describe what you were trying to do'));
  console.log(chalk.gray('   and what went wrong. This will help us improve!'));
}

module.exports = panicCommand;