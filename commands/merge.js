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
    } else if (options.verbose) {
      // Also try auto-detection when verbose to show what would have been detected
      const autoDetected = await getCurrentWorktree();
      if (autoDetected) {
        output.verboseStep('merge', `would have auto-detected: ${autoDetected}`);
      }
    }
    
    // Additional debug info
    if (options.verbose) {
      const repoInfo = await rootFinder.findRoot();
      output.verboseStep('merge', `running from: ${process.cwd()}`);
      output.verboseStep('merge', `main repo root: ${repoInfo.root}`);
      if (repoInfo.isWorktree) {
        output.verboseStep('merge', `in worktree: ${repoInfo.worktreeName}`);
        output.verboseStep('merge', `worktree path: ${repoInfo.currentWorktreePath}`);
      }
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
    
    // Debug: check if we're getting worktrees
    let worktrees;
    try {
      worktrees = await gitOps.listWorktrees();
      if (options.verbose) {
        output.verboseStep('merge', `gitOps.listWorktrees() returned ${worktrees ? worktrees.length : 'null'} worktrees`);
      }
    } catch (error) {
      if (options.verbose) {
        output.verboseStep('merge', `gitOps.listWorktrees() failed: ${error.message}`);
      }
      throw error;
    }
    
    // Debug logging
    if (options.verbose) {
      output.verboseStep('merge', `looking for worktree with name: ${worktreeName}`);
      output.verboseStep('merge', `config.mainRoot: ${config.mainRoot}`);
      output.verboseStep('merge', `config.baseDir: ${config.get().baseDir}`);
      output.verboseStep('merge', `expected path: ${worktreePath}`);
      output.verboseStep('merge', `found ${worktrees.length} worktrees:`);
      worktrees.forEach(wt => {
        output.verboseStep('merge', `  - path: ${wt.path}, branch: ${wt.branch}`);
      });
    }
    
    // Try multiple matching strategies
    let worktree = worktrees.find(wt => {
      const matches = PathUtils.equals(wt.path, worktreePath);
      if (options.verbose) {
        output.verboseStep('merge', `  comparing paths: '${wt.path}' === '${worktreePath}' ? ${matches}`);
      }
      return matches;
    });
    
    if (!worktree) {
      // Fallback: Try matching by worktree name in the path
      if (options.verbose) {
        output.verboseStep('merge', 'trying to match by worktree name in path');
      }
      worktree = worktrees.find(wt => {
        const wtName = path.basename(wt.path);
        if (options.verbose) {
          output.verboseStep('merge', `  comparing '${wtName}' with '${worktreeName}'`);
        }
        return wtName === worktreeName;
      });
    }
    
    if (!worktree) {
      // Try matching with 'wt-' prefix (legacy naming)
      if (options.verbose) {
        output.verboseStep('merge', 'trying to match with wt- prefix');
      }
      const legacyName = `wt-${worktreeName}`;
      worktree = worktrees.find(wt => {
        const wtName = path.basename(wt.path);
        return wtName === legacyName;
      });
    }
    
    if (!worktree) {
      // Last resort: Try matching by branch name directly
      if (options.verbose) {
        output.verboseStep('merge', 'trying to match by branch name');
      }
      worktree = worktrees.find(wt => wt.branch === worktreeName);
    }
    
    if (!worktree) {
      // Additional fallback: check if we're currently in the worktree
      const repoInfo = await rootFinder.findRoot();
      if (repoInfo.isWorktree && repoInfo.worktreeName === worktreeName) {
        // We're in the worktree but it's not in the list - might be a git issue
        // Try to find it by checking if the current path matches any worktree
        worktree = worktrees.find(wt => PathUtils.equals(wt.path, repoInfo.currentWorktreePath));
        if (!worktree) {
          // Create a synthetic worktree entry
          const worktreeGit = require('simple-git')(repoInfo.currentWorktreePath);
          const status = await worktreeGit.status();
          worktree = {
            path: repoInfo.currentWorktreePath,
            branch: status.current,
            commit: 'HEAD',
            bare: false,
            detached: false
          };
          if (options.verbose) {
            output.verboseStep('merge', 'created synthetic worktree entry for current directory');
          }
        }
      }
    }
    
    if (!worktree) {
      output.error('merge', `worktree '${worktreeName}' not found`);
      if (options.verbose) {
        output.verboseStep('merge', 'available worktrees:');
        worktrees.forEach(wt => {
          output.verboseStep('merge', `  - ${path.basename(wt.path)} (branch: ${wt.branch})`);
        });
      }
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
async function validateMerge(worktreeName, options, configObj) {
  const issues = [];
  
  try {
    // Check if worktree exists - use the global config instance, not the passed object
    const worktreePath = config.getWorktreePath(worktreeName);
    
    const exists = await require('fs-extra').pathExists(worktreePath);
    if (!exists) {
      // Debug: show what path we're checking
      if (process.env.WTT_DEBUG === 'true') {
        console.error(`[DEBUG] validateMerge: worktree path '${worktreePath}' does not exist`);
        console.error(`[DEBUG] validateMerge: config.getWorktreePath available: ${!!config.getWorktreePath}`);
        console.error(`[DEBUG] validateMerge: process.cwd(): ${process.cwd()}`);
      }
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