const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const PathUtils = require('../lib/pathUtils');
const MessageFormatter = require('../lib/merge-helper/message-formatter');
const BackupManager = require('../lib/merge-helper/backup-manager');
const ConflictDetector = require('../lib/merge-helper/conflict-detector');
const Output = require('../lib/output');
const { getCurrentWorktree } = require('../lib/currentWorktree');
const rootFinder = require('../lib/rootFinder');

async function mergeCommand(worktreeName, options) {
  const output = new Output(options);
  const messageFormatter = new MessageFormatter();
  
  try {
    await gitOps.validateRepository();
    await config.load();
    
    // Auto-detect current worktree if no name provided
    if (!worktreeName) {
      worktreeName = await getCurrentWorktree();
      if (!worktreeName) {
        throw new Error('No worktree specified and not currently inside a worktree. Use \'wt list\' to see available worktrees.');
      }
      output.verboseStep('merge', `auto-detected current worktree: ${worktreeName}`);
    }
    
    const backupManager = new BackupManager(config.getBaseDir());
    
    const cfg = config.get();
    await portManager.init(config.getBaseDir());
    
    // Phase 1: Pre-merge validation
    const validation = await validateMerge(worktreeName, options, cfg);
    if (!validation.safe) {
      handlePreMergeIssues(validation.issues, messageFormatter);
      // handlePreMergeIssues will exit the process
    }
    
    const worktreePath = config.getWorktreePath(worktreeName);
    
    const worktrees = await gitOps.listWorktrees();
    
    // Try multiple matching strategies
    let worktree = worktrees.find(wt => PathUtils.equals(wt.path, worktreePath));
    
    if (!worktree) {
      // Fallback: Try matching by worktree name in the path
      worktree = worktrees.find(wt => {
        const wtName = path.basename(wt.path);
        return wtName === worktreeName;
      });
    }
    
    if (!worktree) {
      // Last resort: Try matching by branch name directly
      worktree = worktrees.find(wt => wt.branch === worktreeName);
    }
    
    if (!worktree) {
      throw new Error(`Worktree '${worktreeName}' doesn't exist. Use 'wt list' to see available worktrees`);
    }
    
    const branchName = worktree.branch;
    if (!branchName) {
      throw new Error('Unable to determine which branch this worktree is using. The worktree may be in a detached HEAD state or corrupted. Try "wt remove" and recreate it');
    }
    
    output.verboseStep('merge', `checking worktree '${worktreeName}'`);
    
    // If --check option is set, run conflict prediction and exit
    if (options.check) {
      console.log(chalk.blue('\n🔍 Running merge preview...\n'));
      
      const ConflictDetector = require('../lib/merge-helper/conflict-detector');
      const detector = new ConflictDetector();
      const mainBranch = await gitOps.getMainBranch(cfg);
      
      // Switch to worktree branch to analyze
      await gitOps.git.cwd(worktreePath);
      const predictions = await detector.predictConflicts(mainBranch);
      
      console.log(chalk.blue('Merge preview results:\n'));
      console.log('✅ No uncommitted changes');
      console.log('✅ Branch is ready to merge');
      
      if (predictions.length === 0) {
        console.log(chalk.green('✅ No conflicts predicted'));
        console.log(chalk.gray('\nThis merge should proceed smoothly.'));
      } else {
        console.log(chalk.yellow(`⚠️  ${predictions.length} file(s) will have conflicts:`));
        predictions.forEach(pred => {
          console.log(chalk.yellow(`   - ${pred.file} (${pred.risk} risk)`));
          console.log(chalk.gray(`     ${pred.reason}`));
        });
        
        console.log(chalk.cyan('\n💡 To proceed with the actual merge:'));
        console.log(chalk.gray(`   wt merge ${worktreeName}`));
      }
      
      // Reset cwd
      await gitOps.git.cwd(process.cwd());
      return;
    }
    
    // Create safety backup before proceeding
    await backupManager.createSafetyBackup('merge', {
      metadata: { worktreeName, branchName, targetBranch: await gitOps.getMainBranch(cfg) }
    });
    
    // Phase 2: Conflict prediction (unless --force is used)
    if (!options.force) {
      const detector = new ConflictDetector();
      const mainBranch = await gitOps.getMainBranch(cfg);
      
      // Switch to worktree branch to analyze
      await gitOps.git.cwd(worktreePath);
      const predictions = await detector.predictConflicts(mainBranch);
      await gitOps.git.cwd(process.cwd());
      
      if (predictions.length > 0) {
        console.log(chalk.yellow('\n⚠️  Potential conflicts detected:\n'));
        predictions.forEach(pred => {
          console.log(chalk.yellow(`   ${pred.file} (${pred.risk} risk)`));
          console.log(chalk.gray(`   └─ ${pred.reason}`));
        });
        
        if (!options.yes && process.env.WTT_AUTO_CONFIRM !== 'true') {
          const { proceed } = await inquirer.prompt([{
            type: 'confirm',
            name: 'proceed',
            message: 'Continue with merge anyway?',
            default: true
          }]);
          
          if (!proceed) {
            console.log(chalk.yellow('\nMerge cancelled.'));
            console.log(chalk.gray('Your backup has been preserved and can be accessed if needed.'));
            process.exit(0);
          }
        }
      }
    }
    
    const hasUncommitted = await gitOps.hasUncommittedChanges(worktreePath);
    if (hasUncommitted) {
      // This should have been caught by pre-merge validation
      // but check again just in case
      throw new Error('Worktree has uncommitted changes. Please commit or stash changes before merging');
    }
    console.log(chalk.green('✓ No uncommitted changes'));
    
    const hasUnpushed = await gitOps.hasUnpushedCommits(worktreePath);
    if (hasUnpushed) {
      console.log(chalk.yellow('⚠ Branch has unpushed commits'));
      let shouldPush = true;
      
      // Auto-confirm in test/automation environments, otherwise prompt
      if (process.env.WTT_AUTO_CONFIRM !== 'true') {
        const result = await inquirer.prompt([{
          type: 'confirm',
          name: 'shouldPush',
          message: 'Push commits to origin before merging?',
          default: true
        }]);
        shouldPush = result.shouldPush;
      }
      
      if (shouldPush) {
        const worktreeGit = require('simple-git')(worktreePath);
        await worktreeGit.push();
        console.log(chalk.green('✓ Pushed commits to origin'));
      }
    } else {
      console.log(chalk.green('✓ Branch is up to date with origin'));
    }
    
    const mainBranch = await gitOps.getMainBranch(cfg);
    console.log('\n' + chalk.blue(`Merging to ${mainBranch}...`));
    
    // Phase 3: Execute merge with monitoring
    const mergeProgress = ProgressUI.displayMergeProgress(branchName, mainBranch, [
      'Switching to main branch',
      'Merging changes',
      'Updating references',
      'Finalizing merge'
    ]);
    
    try {
      mergeProgress.updateSection(0, 'in_progress');
      
      // When performing merge operations, we need to use the main repository context
      // Get the main repository root
      const mainRepoRoot = await rootFinder.getMainRepoRoot();
      
      // Create a git instance specifically for the main repository
      const mainGit = require('simple-git')(mainRepoRoot);
      
      // First, check what branch the main repository is currently on
      const status = await mainGit.status();
      
      // If we're not on the main branch, we need to switch to it
      if (status.current !== mainBranch) {
        await mainGit.checkout(mainBranch);
      }
      
      mergeProgress.updateSection(0, 'completed');
      console.log(chalk.green(`✓ Switched to branch '${mainBranch}'`));
      
      mergeProgress.updateSection(1, 'in_progress');
      await mainGit.merge([branchName]);
      mergeProgress.updateSection(1, 'completed');
      console.log(chalk.green(`✓ Merged '${branchName}'`));
      
      mergeProgress.updateSection(2, 'in_progress');
      mergeProgress.updateSection(2, 'completed');
      
      mergeProgress.updateSection(3, 'in_progress');
      mergeProgress.updateSection(3, 'completed');
      
      mergeProgress.complete();
    } catch (error) {
      mergeProgress.fail();
      
      // Log more details about the error for debugging
      if (process.env.WTT_DEBUG) {
        console.error('Merge error:', error);
        console.error('Error stack:', error.stack);
      }
      
      // Check if it's a merge conflict
      if (error.message.includes('CONFLICT') || error.message.includes('fix conflicts')) {
        console.log(chalk.red('\n❌ Merge failed due to conflicts\n'));
        console.log(chalk.yellow('The merge resulted in conflicts that need to be resolved.'));
        console.log(chalk.cyan('\nNext steps:'));
        console.log(chalk.gray('1. Run "wt conflicts list" to see all conflicts'));
        console.log(chalk.gray('2. Run "wt conflicts fix" to resolve them interactively'));
        console.log(chalk.gray('3. Or run "wt merge --abort" to cancel the merge'));
        
        // Store merge state for recovery
        await backupManager.saveMergeState({
          worktreeName,
          branchName,
          mainBranch,
          conflicted: true,
          timestamp: new Date().toISOString()
        });
      }
      
      throw error;
    }
    
    // Check if we should clean up based on config or explicit option
    // When --no-delete is passed, options.delete is explicitly false
    const shouldConsiderCleanup = options.delete === true || (cfg.autoCleanup && options.delete !== false);
    
    if (shouldConsiderCleanup) {
      let confirmDelete = true;
      
      // Auto-confirm in test/automation environments, otherwise prompt
      if (process.env.WTT_AUTO_CONFIRM !== 'true' && !cfg.autoCleanup) {
        const result = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirmDelete',
          message: 'Delete worktree and branch?',
          default: true
        }]);
        confirmDelete = result.confirmDelete;
      }
      
      if (confirmDelete) {
        await gitOps.removeWorktree(worktreePath);
        console.log(chalk.green('✓ Removed worktree'));
        
        try {
          await gitOps.deleteBranch(branchName);
          console.log(chalk.green(`✓ Deleted branch '${branchName}'`));
        } catch (error) {
          console.log(chalk.yellow('⚠ Could not delete the branch automatically. You can delete it manually later'));
        }
        
        const ports = portManager.getPorts(worktreeName);
        if (ports) {
          await portManager.releasePorts(worktreeName);
          const portList = Object.values(ports).join(', ');
          console.log(chalk.green(`✓ Released ports ${portList}`));
        }
      }
    }
    
  } catch (error) {
    // Check if this is a pre-merge validation error (already handled)
    if (error.message && error.message.includes('Pre-merge validation failed')) {
      // Already displayed error messages in handlePreMergeIssues
      process.exit(1);
    }
    
    const errorLevel = process.env.WTT_ERROR_LEVEL || 'enhanced';
    
    if (errorLevel === 'simple') {
      // Simple error message
      output.error('merge', error.message);
    } else {
      // Enhanced error handling with human-friendly messages
      const formattedError = messageFormatter.formatMergeError(
        error,
        await gitOps.getMainBranch(config.get()).catch(() => 'main'),
        config.get().mergeHelper?.skillLevel || 'beginner'
      );
      
      messageFormatter.displayFormattedError(formattedError, { verbose: options.verbose });
    }
    
    process.exit(1);
  }
}

// Phase 1: Pre-merge validation
async function validateMerge(worktreeName, _options, _cfg) {
  const issues = [];
  
  try {
    // Check for uncommitted changes in main repo
    const hasUncommitted = await gitOps.hasUncommittedChanges();
    if (hasUncommitted) {
      // Check if the uncommitted changes are just worktree files
      const git = require('simple-git')(config.getBaseDir() ? path.dirname(config.getBaseDir()) : process.cwd());
      const status = await git.status();
      
      const worktreeFiles = ['.worktree-config.json', '.worktrees/'];
      const onlyWorktreeFiles = status.files.every(file => 
        worktreeFiles.some(wf => file.path.includes(wf))
      );
      
      if (onlyWorktreeFiles) {
        issues.push({
          type: 'uncommittedChanges',
          severity: 'blocking',
          message: 'Worktree configuration files are not in .gitignore',
          detail: 'Run "wt init" to update .gitignore, then commit the changes'
        });
      } else {
        issues.push({
          type: 'uncommittedChanges',
          severity: 'blocking',
          message: 'Main repository has uncommitted changes'
        });
      }
    }
    
    // Check git status - TODO: gitOps.status() doesn't exist yet
    // const gitStatus = await gitOps.status();
    // if (gitStatus && gitStatus.conflicted && gitStatus.conflicted.length > 0) {
    //   issues.push({
    //     type: 'conflictMarkers',
    //     severity: 'blocking',
    //     message: 'Repository has unresolved merge conflicts',
    //     files: gitStatus.conflicted
    //   });
    // }
    
    // Check if worktree exists and get its path
    const worktreePath = config.getWorktreePath(worktreeName);
    const worktrees = await gitOps.listWorktrees();
    
    let worktree = worktrees.find(wt => PathUtils.equals(wt.path, worktreePath));
    if (!worktree) {
      worktree = worktrees.find(wt => {
        const wtName = path.basename(wt.path);
        return wtName === worktreeName;
      });
    }
    if (!worktree) {
      worktree = worktrees.find(wt => wt.branch === worktreeName);
    }
    
    if (!worktree) {
      issues.push({
        type: 'worktreeNotFound',
        severity: 'blocking',
        message: `Worktree '${worktreeName}' not found`,
        worktreeName: worktreeName
      });
      return { safe: false, issues };
    }
    
    // Check for uncommitted changes in worktree
    const hasWorktreeUncommitted = await gitOps.hasUncommittedChanges(worktree.path);
    if (hasWorktreeUncommitted) {
      issues.push({
        type: 'uncommittedChanges',
        severity: 'blocking',
        message: `Worktree '${worktreeName}' has uncommitted changes`,
        worktree: worktree.path
      });
    }
    
    return {
      safe: issues.filter(i => i.severity === 'blocking').length === 0,
      issues,
      worktree
    };
    
  } catch (error) {
    return {
      safe: false,
      issues: [{
        type: 'validationError',
        severity: 'blocking',
        message: `Validation failed: ${error.message}`
      }]
    };
  }
}

function handlePreMergeIssues(issues, _messageFormatter) {
  const errorLevel = process.env.WTT_ERROR_LEVEL || 'enhanced';
  
  if (errorLevel === 'simple') {
    // Simple error messages for automation/testing
    for (const issue of issues) {
      if (issue.severity === 'blocking') {
        switch (issue.type) {
        case 'uncommittedChanges':
          console.log('✗ Worktree has uncommitted changes');
          console.log('Please commit or stash changes before merging');
          break;
        case 'worktreeNotFound':
          console.error('Error:', `Worktree '${issue.worktreeName}' doesn't exist. Use 'wt list' to see available worktrees`);
          break;
        }
      }
    }
  } else {
    // Enhanced error messages for regular use
    console.log(chalk.red.bold('\n❌ Pre-merge validation failed\n'));
    
    for (const issue of issues) {
      if (issue.severity === 'blocking') {
        // Display the issue message directly with formatting
        console.log(chalk.yellow(issue.message));
        if (issue.detail) {
          console.log(chalk.gray(`  ${issue.detail}`));
        }
        if (issue.worktree) {
          console.log(chalk.gray(`  Worktree: ${issue.worktree}`));
        }
        console.log();
      }
    }
    
    console.log(chalk.blue.bold('\n🔧 Resolution Options:\n'));
    console.log('1) Commit your changes');
    console.log(chalk.gray('   Git: git add . && git commit -m "Your message"'));
    console.log();
    console.log('2) Stash your changes');
    console.log(chalk.gray('   Git: git stash'));
    console.log();
    
    console.log(chalk.yellow('\nPlease resolve the above issues before attempting to merge.'));
  }
  
  process.exit(1);
}

module.exports = { mergeCommand };