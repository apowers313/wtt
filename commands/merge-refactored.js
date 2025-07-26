const path = require('path');
const simpleGit = require('simple-git');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const Output = require('../lib/output');
const PathManager = require('../lib/path-manager');
const Validator = require('../lib/validator');
const { getCurrentWorktree } = require('../lib/currentWorktree');
const rootFinder = require('../lib/rootFinder');

/**
 * Refactored merge command using new concise output system
 * 
 * Design goals:
 * - Maximum 3 lines of output unless --verbose
 * - No directory switching, use git -C flag
 * - Pre-validation to prevent failures
 * - Clear error messages with exit codes
 */
async function mergeCommand(worktreeName, options) {
  const output = new Output(options);
  let git, pathManager, validator;

  try {
    // Initialize git and helpers
    const gitRoot = await rootFinder.findGitRoot();
    git = simpleGit(gitRoot);
    pathManager = new PathManager(gitRoot);
    validator = new Validator();

    output.verboseStep('merge', 'initializing git repository');
    
    // Auto-detect current worktree if no name provided
    if (!worktreeName) {
      worktreeName = await getCurrentWorktree();
      if (!worktreeName) {
        output.error('merge', 'no worktree specified and not currently inside a worktree');
        output.exitInfo('merge', 2, 'no worktree to merge');
        process.exit(2);
      }
      output.verboseStep('merge', `auto-detected current worktree: ${worktreeName}`);
    }

    // Load configuration
    await config.load();
    const cfg = config.get();
    const mainBranch = cfg.mainBranch || 'main';

    output.verboseStep('merge', `target branch: ${mainBranch}`);

    // Validate merge operation
    const validationErrors = await validator.validateMergeOperation(
      git, pathManager, worktreeName, mainBranch, options
    );

    if (validationErrors.length > 0) {
      const errorMessage = validationErrors.length === 1 
        ? validationErrors[0]
        : `${validationErrors.length} validation errors`;
      
      output.error('merge', errorMessage);
      
      if (options.verbose && validationErrors.length > 1) {
        validationErrors.forEach(error => {
          output.raw(`  - ${error}`);
        });
      }
      
      output.exitInfo('merge', 2, 'validation failed');
      process.exit(2);
    }

    // Get worktree path and branch info
    const worktreePath = pathManager.getWorktreePath(worktreeName);
    const displayName = pathManager.getDisplayName(worktreeName);

    // Get branch name from worktree
    let branchName;
    try {
      branchName = await git.raw(['-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD']);
      branchName = branchName.trim();
    } catch (error) {
      output.error('merge', `cannot determine branch for worktree '${displayName}'`);
      output.exitInfo('merge', 2, 'invalid worktree state');
      process.exit(2);
    }

    if (branchName === 'HEAD') {
      output.error('merge', `worktree '${displayName}' is in detached HEAD state`);
      output.exitInfo('merge', 2, 'detached HEAD');
      process.exit(2);
    }

    // Perform the merge
    output.status('merge', 'merging', `${branchName} → ${mainBranch}`);

    try {
      // Switch to main repository root and merge
      await git.cwd(gitRoot);
      await git.checkout(mainBranch);
      
      output.verboseStep('merge', `checked out ${mainBranch}`);
      
      const mergeResult = await git.merge([branchName]);
      
      output.verboseStep('merge', 'merge completed successfully');
      
    } catch (error) {
      // Handle merge conflicts
      if (error.message.includes('CONFLICT') || error.git?.conflicts) {
        const status = await git.status();
        const conflictCount = status.conflicted ? status.conflicted.length : 'unknown';
        
        output.error('merge', `conflicts in ${conflictCount} files (run 'git status' for details)`);
        output.exitInfo('merge', 1, 'merge conflicts');
        process.exit(1);
      }
      
      // Handle other merge errors
      output.error('merge', `merge failed: ${error.message}`);
      output.exitInfo('merge', 2, 'merge error');
      process.exit(2);
    }

    // Handle cleanup if requested
    if (options.delete || (cfg.autoCleanup && options.noDelete !== true)) {
      output.verboseStep('merge', 'cleaning up worktree');
      
      try {
        // Remove git worktree
        await git.raw(['worktree', 'remove', worktreePath]);
        
        // Release ports
        await portManager.init(config.getBaseDir());
        await portManager.releasePorts(worktreeName);
        
        output.verboseStep('merge', 'worktree and ports cleaned up');
        
        output.success('merge', `merged '${branchName}' into ${mainBranch} and removed worktree`);
      } catch (cleanupError) {
        output.warning('merge', `cleanup failed: ${cleanupError.message}`);
        output.success('merge', `merged '${branchName}' into ${mainBranch} (manual cleanup needed)`);
      }
    } else {
      output.success('merge', `merged '${branchName}' into ${mainBranch}`);
    }

  } catch (error) {
    // Catch-all error handler
    output.error('merge', error.message);
    output.exitInfo('merge', 2, 'unexpected error');
    process.exit(2);
  }
}

module.exports = { mergeCommand };