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
        output.error('merge', 'no worktree specified and not currently inside a worktree');
        process.exit(1);
      }
      output.verboseStep('merge', `auto-detected current worktree: ${worktreeName}`);
    }
    
    const backupManager = new BackupManager(config.getBaseDir());
    const cfg = config.get();
    await portManager.init(config.getBaseDir());
    
    // Phase 1: Pre-merge validation
    const validation = await validateMerge(worktreeName, options, cfg);
    if (!validation.safe) {
      handlePreMergeIssues(validation.issues, messageFormatter, output);
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
      output.error('merge', `worktree '${worktreeName}' not found`);
      process.exit(1);
    }
    
    const branchName = worktree.branch;
    if (!branchName) {
      output.error('merge', 'worktree is in detached HEAD state');
      process.exit(1);
    }
    
    output.verboseStep('merge', `checking worktree '${worktreeName}'`);
    
    // If --check option is set, run conflict prediction and exit
    if (options.check) {
      output.verboseStep('merge', 'running merge preview');
      
      const ConflictDetector = require('../lib/merge-helper/conflict-detector');
      const detector = new ConflictDetector();
      const mainBranch = await gitOps.getMainBranch(cfg);
      
      // Switch to worktree branch to analyze
      await gitOps.git.cwd(worktreePath);
      const predictions = await detector.predictConflicts(mainBranch);
      
      if (predictions.length === 0) {
        output.success('merge', 'no conflicts predicted');
      } else {
        output.warning('merge', `${predictions.length} files will have conflicts`);
        if (options.verbose) {
          predictions.forEach(pred => {
            console.log(`   - ${pred.file} (${pred.risk} risk): ${pred.reason}`);
          });
        }
      }
      
      process.exit(0);
    }
    
    // Phase 2: Create backup (silently unless verbose)
    output.verboseStep('merge', 'creating safety backup');
    const backupId = await createSilentBackup(backupManager, 'merge');
    output.verboseStep('merge', `backup created: ${backupId}`);
    
    const hasUncommitted = await gitOps.hasUncommittedChanges(worktreePath);
    if (hasUncommitted) {
      output.error('merge', 'uncommitted changes in worktree');
      process.exit(1);
    }
    output.verboseStep('merge', 'no uncommitted changes');
    
    const hasUnpushed = await gitOps.hasUnpushedCommits(worktreePath);
    if (hasUnpushed) {
      output.verboseStep('merge', 'branch has unpushed commits');
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
        output.verboseStep('merge', 'pushed commits to origin');
      }
    } else {
      output.verboseStep('merge', 'branch is up to date with origin');
    }
    
    const mainBranch = await gitOps.getMainBranch(cfg);
    
    // Phase 3: Execute merge
    output.status('merge', 'merging', `${branchName} → ${mainBranch}`);
    
    try {
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
      
      output.verboseStep('merge', `switched to branch '${mainBranch}'`);
      
      await mainGit.merge([branchName]);
      
      output.verboseStep('merge', `merged '${branchName}' successfully`);
      
    } catch (error) {
      // Check if it's a merge conflict
      if (error.message.includes('CONFLICT') || error.message.includes('fix conflicts')) {
        const conflictCount = await getConflictCount(error);
        output.error('merge', `conflicts in ${conflictCount} files (run 'git status' for details)`);
        
        // Store merge state for recovery
        await backupManager.saveMergeState({
          worktreeName,
          branchName,
          mainBranch,
          conflicted: true,
          timestamp: new Date().toISOString()
        });
        
        process.exit(1);
      }
      
      throw error;
    }
    
    // Check if we should clean up based on config or explicit option
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
        output.verboseStep('merge', 'removed worktree');
        
        try {
          await gitOps.deleteBranch(branchName);
          output.verboseStep('merge', `deleted branch '${branchName}'`);
        } catch (error) {
          output.verboseStep('merge', 'could not delete branch automatically');
        }
        
        const ports = portManager.getPorts(worktreeName);
        if (ports) {
          await portManager.releasePorts(worktreeName);
          const portList = Object.values(ports).join(', ');
          output.verboseStep('merge', `released ports ${portList}`);
        }
        
        output.success('merge', `merged '${branchName}' into ${mainBranch} and removed worktree`);
      } else {
        output.success('merge', `merged '${branchName}' into ${mainBranch}`);
      }
    } else {
      output.success('merge', `merged '${branchName}' into ${mainBranch}`);
    }
    
  } catch (error) {
    // Check if this is a pre-merge validation error (already handled)
    if (error.message && error.message.includes('Pre-merge validation failed')) {
      // Already displayed error messages in handlePreMergeIssues
      process.exit(1);
    }
    
    output.error('merge', error.message);
    process.exit(1);
  }
}

// Silent backup creation
async function createSilentBackup(backupManager, operation) {
  await backupManager.init();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `${operation}-${timestamp}`;
  const operationBackupDir = path.join(backupManager.backupDir, backupId);
  
  await require('fs-extra').ensureDir(operationBackupDir);
  
  // Save current state silently
  const currentBranch = await backupManager.getCurrentBranch();
  const currentCommit = await backupManager.getCurrentCommit();
  
  const backup = {
    id: backupId,
    operation,
    timestamp: new Date().toISOString(),
    branch: currentBranch,
    commit: currentCommit,
    workingDirectory: backupManager.baseDir
  };
  
  await require('fs-extra').writeJson(
    path.join(operationBackupDir, 'backup.json'),
    backup,
    { spaces: 2 }
  );
  
  return backupId;
}

// Get conflict count from error
async function getConflictCount(error) {
  // Try to extract conflict count from error message
  const match = error.message.match(/(\d+) conflict/);
  if (match) {
    return match[1];
  }
  
  // Default to generic count
  return 'multiple';
}

// Handle pre-merge issues with concise output
function handlePreMergeIssues(issues, messageFormatter, output) {
  if (!issues || issues.length === 0) {
    return;
  }
  
  const issue = issues[0]; // Show first issue only
  
  switch (issue.type) {
    case 'uncommitted_changes':
      output.error('merge', 'uncommitted changes in worktree');
      break;
    case 'detached_head':
      output.error('merge', 'worktree is in detached HEAD state');
      break;
    case 'branch_missing':
      output.error('merge', `branch '${issue.branch}' not found`);
      break;
    case 'worktree_missing':
      output.error('merge', `worktree '${issue.worktree}' not found`);
      break;
    default:
      output.error('merge', issue.message || 'pre-merge validation failed');
  }
  
  process.exit(1);
}

// Validation function (unchanged but returns structured data)
async function validateMerge(worktreeName, options, config) {
  const issues = [];
  
  try {
    // Check if worktree exists
    const worktreePath = config.getWorktreePath ? 
      config.getWorktreePath(worktreeName) : 
      path.join(process.cwd(), '.worktrees', worktreeName);
    
    const exists = await require('fs-extra').pathExists(worktreePath);
    if (!exists) {
      issues.push({ type: 'worktree_missing', worktree: worktreeName });
      return { safe: false, issues };
    }
    
    // Check for uncommitted changes
    const hasUncommitted = await gitOps.hasUncommittedChanges(worktreePath);
    if (hasUncommitted && !options.force) {
      issues.push({ type: 'uncommitted_changes', path: worktreePath });
    }
    
    // More validation can be added here
    
  } catch (error) {
    issues.push({ type: 'error', message: error.message });
  }
  
  return {
    safe: issues.length === 0,
    issues
  };
}

module.exports = { mergeCommand };