const chalk = require('chalk');
const inquirer = require('inquirer');
const { simpleGit } = require('simple-git');
const gitOps = require('../lib/gitOps');
const BackupManager = require('../lib/merge-helper/backup-manager');
const { addCommandContext } = require('../lib/errorTranslator');
const ProgressUI = require('../lib/ui/progress-ui');

/**
 * Find commits that might be lost
 */
async function recoveryFindCommitsCommand(options = {}) {
  try {
    await gitOps.validateRepository();
    
    const git = simpleGit();
    console.log(chalk.blue('Searching for recent work that might be lost...\n'));
    
    const spinner = ProgressUI.createSpinner('Scanning git reflog');
    spinner.start();
    
    // Get reflog entries
    const reflogOutput = await git.raw(['reflog', '--date=relative', '--format=%h %gd %gs %s']);
    const reflogEntries = reflogOutput.split('\n').filter(line => line.trim());
    
    // Get commits from the last 30 days (or custom since date)
    const sinceDate = options.since ? new Date(options.since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Parse reflog entries
    const commits = [];
    const seenCommits = new Set();
    
    for (const entry of reflogEntries) {
      const match = entry.match(/^([a-f0-9]+)\s+.*?:\s+(.+?)(?:\s+(.+))?$/);
      if (match) {
        const [, hash, action] = match;
        
        if (!seenCommits.has(hash)) {
          seenCommits.add(hash);
          
          try {
            // Get commit details
            const commitInfo = await git.show([hash, '--format=%H|%ai|%an|%s', '--no-patch']);
            const [fullHash, date, author, subject] = commitInfo.split('|');
            
            const commitDate = new Date(date);
            if (commitDate >= sinceDate) {
              // Check if commit is reachable from any branch
              const branches = await git.raw(['branch', '--contains', hash]);
              const isReachable = branches.trim().length > 0;
              
              if (!isReachable || options.all) {
                commits.push({
                  hash: fullHash.substring(0, 7),
                  fullHash,
                  date: commitDate,
                  author,
                  subject,
                  action,
                  isReachable
                });
              }
            }
          } catch {
            // Commit might be corrupted or unavailable
          }
        }
      }
    }
    
    spinner.stop('Search complete');
    
    if (commits.length === 0) {
      console.log(chalk.green('\n✅ No lost commits found!'));
      console.log(chalk.gray('All your recent work is safely in branches.'));
      return;
    }
    
    // Sort by date (newest first)
    commits.sort((a, b) => b.date - a.date);
    
    console.log(chalk.yellow(`\n🔍 Found ${commits.length} commit(s) that might be lost:\n`));
    
    // Group by time
    const now = new Date();
    const groups = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: []
    };
    
    commits.forEach(commit => {
      const daysDiff = Math.floor((now - commit.date) / (24 * 60 * 60 * 1000));
      
      if (daysDiff === 0) {
        groups.today.push(commit);
      } else if (daysDiff === 1) {
        groups.yesterday.push(commit);
      } else if (daysDiff < 7) {
        groups.thisWeek.push(commit);
      } else {
        groups.older.push(commit);
      }
    });
    
    // Display grouped commits
    if (groups.today.length > 0) {
      console.log(chalk.bold('Today:'));
      displayCommitGroup(groups.today);
    }
    
    if (groups.yesterday.length > 0) {
      console.log(chalk.bold('\nYesterday:'));
      displayCommitGroup(groups.yesterday);
    }
    
    if (groups.thisWeek.length > 0) {
      console.log(chalk.bold('\nThis week:'));
      displayCommitGroup(groups.thisWeek);
    }
    
    if (groups.older.length > 0 && options.verbose) {
      console.log(chalk.bold('\nOlder:'));
      displayCommitGroup(groups.older);
    }
    
    console.log(chalk.cyan('\nTo restore a commit:'));
    console.log(chalk.gray('  wt recovery restore <commit-hash>'));
    console.log(chalk.gray('  wt recovery restore <commit-hash> --create-branch'));
    
    // Check for backups
    const backupManager = new BackupManager();
    const backups = await backupManager.listBackups();
    
    if (backups.length > 0) {
      console.log(chalk.cyan('\nYou also have automatic backups:'));
      console.log(chalk.gray(`  wt backup list    # See ${backups.length} backup(s)`));
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    const context = addCommandContext(error.message, 'recovery find-commits');
    if (context.tips && context.tips.length > 0) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

/**
 * Display a group of commits
 */
function displayCommitGroup(commits) {
  commits.forEach(commit => {
    const timeAgo = getRelativeTime(commit.date);
    const reachableIcon = commit.isReachable ? '🔗' : '🕐';
    
    console.log(`  ${reachableIcon} ${chalk.yellow(commit.hash)} - ${commit.subject}`);
    console.log(chalk.gray(`     ${timeAgo} by ${commit.author}`));
  });
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

/**
 * Restore a specific commit or work
 */
async function recoveryRestoreCommand(commitRef, options = {}) {
  try {
    await gitOps.validateRepository();
    
    const git = simpleGit();
    
    // Verify commit exists
    let commitHash;
    try {
      const result = await git.revparse([commitRef]);
      commitHash = result.trim();
    } catch {
      throw new Error(`Commit '${commitRef}' not found`);
    }
    
    // Get commit details
    const commitInfo = await git.show([commitHash, '--format=%H|%ai|%an|%s', '--no-patch']);
    const [, date, author, subject] = commitInfo.split('|');
    
    console.log(chalk.blue(`\nRestoring commit: ${subject}`));
    console.log(chalk.gray(`By ${author} on ${new Date(date).toLocaleString()}\n`));
    
    // Show what will be restored
    const changes = await git.show([commitHash, '--name-status', '--format=']);
    console.log(chalk.cyan('Changes to be restored:'));
    console.log(changes.split('\n').filter(line => line.trim()).map(line => chalk.gray(`  ${line}`)).join('\n'));
    
    // Determine restoration method
    let restoreMethod;
    
    if (options.createBranch) {
      restoreMethod = 'branch';
    } else {
      const { method } = await inquirer.prompt([{
        type: 'list',
        name: 'method',
        message: 'How would you like to restore this commit?',
        choices: [
          {
            name: 'Cherry-pick to current branch',
            value: 'cherry-pick',
            short: 'Cherry-pick'
          },
          {
            name: 'Create new branch from commit',
            value: 'branch',
            short: 'New branch'
          },
          {
            name: 'Apply changes without committing',
            value: 'apply',
            short: 'Apply only'
          },
          {
            name: 'View more details first',
            value: 'details',
            short: 'Details'
          }
        ]
      }]);
      
      restoreMethod = method;
    }
    
    // Execute restoration
    switch (restoreMethod) {
    case 'cherry-pick':
      await restoreWithCherryPick(git, commitHash, subject);
      break;
        
    case 'branch':
      await restoreWithBranch(git, commitHash, subject);
      break;
        
    case 'apply':
      await restoreWithApply(git, commitHash, subject);
      break;
        
    case 'details':
      await showCommitDetails(git, commitHash);
      // Recursively call to try again
      return recoveryRestoreCommand(commitRef, options);
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    const context = addCommandContext(error.message, 'recovery restore');
    if (context.tips && context.tips.length > 0) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

/**
 * Restore commit using cherry-pick
 */
async function restoreWithCherryPick(git, commitHash, subject) {
  console.log(chalk.blue('\nCherry-picking commit...'));
  
  try {
    await git.raw(['cherry-pick', commitHash]);
    console.log(chalk.green(`\n✅ Successfully restored: ${subject}`));
  } catch (error) {
    if (error.message.includes('conflict')) {
      console.log(chalk.yellow('\n⚠️  Cherry-pick resulted in conflicts'));
      console.log(chalk.gray('Resolve conflicts and run:'));
      console.log(chalk.gray('  git cherry-pick --continue'));
    } else {
      throw error;
    }
  }
}

/**
 * Restore commit by creating new branch
 */
async function restoreWithBranch(git, commitHash, subject) {
  const { branchName } = await inquirer.prompt([{
    type: 'input',
    name: 'branchName',
    message: 'New branch name:',
    default: `restore-${commitHash.substring(0, 7)}`,
    validate: (name) => {
      if (!name || name.trim() === '') {
        return 'Branch name is required';
      }
      return true;
    }
  }]);
  
  console.log(chalk.blue(`\nCreating branch '${branchName}' from commit...`));
  
  await git.checkout(['-b', branchName, commitHash]);
  console.log(chalk.green(`\n✅ Created and switched to branch '${branchName}'`));
  console.log(chalk.gray(`This branch contains: ${subject}`));
}

/**
 * Restore commit by applying changes only
 */
async function restoreWithApply(git, commitHash, _subject) {
  console.log(chalk.blue('\nApplying changes without committing...'));
  
  // Get the patch
  const patch = await git.show([commitHash, '--format=']);
  
  // Apply the patch
  try {
    await git.raw(['apply', '--3way'], patch);
    console.log(chalk.green('\n✅ Changes applied to working directory'));
    console.log(chalk.gray('Changes are not committed. Review and commit when ready.'));
  } catch (error) {
    if (error.message.includes('conflict')) {
      console.log(chalk.yellow('\n⚠️  Some changes could not be applied cleanly'));
      console.log(chalk.gray('Manual intervention may be required.'));
    } else {
      throw error;
    }
  }
}

/**
 * Show detailed commit information
 */
async function showCommitDetails(git, commitHash) {
  console.log(chalk.blue('\n📋 Commit details:\n'));
  
  const fullDetails = await git.show([commitHash, '--format=full', '--stat']);
  console.log(fullDetails);
  
  const { showDiff } = await inquirer.prompt([{
    type: 'confirm',
    name: 'showDiff',
    message: 'Show full diff?',
    default: false
  }]);
  
  if (showDiff) {
    const diff = await git.show([commitHash]);
    console.log('\n' + diff);
  }
  
  await inquirer.prompt([{
    type: 'input',
    name: 'continue',
    message: 'Press Enter to continue...'
  }]);
}

/**
 * Find and restore from stashes
 */
async function recoveryStashCommand() {
  try {
    await gitOps.validateRepository();
    
    const git = simpleGit();
    const stashList = await git.stashList();
    
    if (stashList.total === 0) {
      console.log(chalk.yellow('No stashes found.'));
      return;
    }
    
    console.log(chalk.blue(`\n📦 Found ${stashList.total} stash(es):\n`));
    
    const stashes = stashList.all.map((stash, index) => ({
      name: `stash@{${index}}: ${stash.message}`,
      value: index,
      hash: stash.hash,
      date: stash.date
    }));
    
    stashes.forEach((stash, index) => {
      console.log(`  ${chalk.yellow(`stash@{${index}}`)} - ${stash.name.split(': ')[1]}`);
      console.log(chalk.gray(`     ${stash.date}`));
    });
    
    const { stashIndex } = await inquirer.prompt([{
      type: 'list',
      name: 'stashIndex',
      message: 'Select stash to restore:',
      choices: stashes
    }]);
    
    const { restoreMethod } = await inquirer.prompt([{
      type: 'list',
      name: 'restoreMethod',
      message: 'How to restore?',
      choices: [
        { name: 'Apply stash (keep in stash list)', value: 'apply' },
        { name: 'Pop stash (remove from stash list)', value: 'pop' },
        { name: 'Create branch from stash', value: 'branch' }
      ]
    }]);
    
    switch (restoreMethod) {
    case 'apply':
      await git.stash(['apply', `stash@{${stashIndex}}`]);
      console.log(chalk.green('\n✅ Stash applied successfully'));
      break;
        
    case 'pop':
      await git.stash(['pop', `stash@{${stashIndex}}`]);
      console.log(chalk.green('\n✅ Stash popped successfully'));
      break;
        
    case 'branch': {
      const { branchName } = await inquirer.prompt([{
        type: 'input',
        name: 'branchName',
        message: 'Branch name:',
        default: `stash-${stashIndex}`
      }]);
        
      await git.stash(['branch', branchName, `stash@{${stashIndex}}`]);
      console.log(chalk.green(`\n✅ Created branch '${branchName}' from stash`));
      break;
    }
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    const context = addCommandContext(error.message, 'recovery stash');
    if (context.tips && context.tips.length > 0) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

module.exports = {
  recoveryFindCommitsCommand,
  recoveryRestoreCommand,
  recoveryStashCommand
};