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
 * Refactored remove command using new concise output system
 */
async function removeCommand(worktreeName, options) {
  const output = new Output(options);
  let git, pathManager, validator;

  try {
    // Initialize git and helpers
    const gitRoot = await rootFinder.findGitRoot();
    git = simpleGit(gitRoot);
    pathManager = new PathManager(gitRoot);
    validator = new Validator();

    output.verboseStep('remove', 'initializing git repository');

    // Auto-detect current worktree if no name provided
    if (!worktreeName) {
      worktreeName = await getCurrentWorktree();
      if (!worktreeName) {
        output.error('remove', 'no worktree specified and not currently inside a worktree');
        output.exitInfo('remove', 2, 'no worktree to remove');
        process.exit(2);
      }
      output.verboseStep('remove', `auto-detected current worktree: ${worktreeName}`);
    }

    // Validate remove operation
    const validationErrors = await validator.validateRemoveOperation(
      git, pathManager, worktreeName, options
    );

    if (validationErrors.length > 0) {
      const errorMessage = validationErrors.length === 1 
        ? validationErrors[0]
        : `${validationErrors.length} validation errors`;
      
      output.error('remove', errorMessage);
      
      if (options.verbose && validationErrors.length > 1) {
        validationErrors.forEach(error => {
          output.raw(`  - ${error}`);
        });
      }
      
      output.exitInfo('remove', 2, 'validation failed');
      process.exit(2);
    }

    // Get paths
    const worktreePath = pathManager.getWorktreePath(worktreeName);
    const displayName = pathManager.getDisplayName(worktreeName);
    const relativePath = pathManager.getRelativeFromRoot(worktreePath);

    // Check for uncommitted changes if not forced
    if (!options.force) {
      try {
        await git.cwd(worktreePath);
        const status = await git.status();
        if (!status.isClean()) {
          output.error('remove', `uncommitted changes in '${displayName}' (use --force to override)`);
          output.exitInfo('remove', 2, 'uncommitted changes');
          process.exit(2);
        }
      } catch (error) {
        output.warning('remove', `cannot check worktree status: ${error.message}`);
      }
    }

    // Perform removal
    output.status('remove', 'removing worktree', `'${displayName}' at ${relativePath}`);

    try {
      // Remove git worktree (this also removes the directory)
      await git.cwd(gitRoot);
      
      const removeArgs = ['worktree', 'remove'];
      if (options.force) {
        removeArgs.push('--force');
        output.verboseStep('remove', 'forcing removal of worktree with uncommitted changes');
      }
      removeArgs.push(worktreePath);

      await git.raw(removeArgs);
      
      output.verboseStep('remove', 'worktree removed from git');

    } catch (error) {
      if (error.message.includes('uncommitted changes')) {
        output.error('remove', `uncommitted changes in '${displayName}' (use --force to override)`);
        output.exitInfo('remove', 1, 'uncommitted changes');
        process.exit(1);
      }
      
      output.error('remove', `failed to remove worktree: ${error.message}`);
      output.exitInfo('remove', 2, 'removal failed');
      process.exit(2);
    }

    // Release ports
    output.verboseStep('remove', 'releasing assigned ports');

    try {
      await config.load();
      await portManager.init(config.getBaseDir());
      await portManager.releasePorts(worktreeName);
      
      output.verboseStep('remove', 'ports released successfully');

    } catch (error) {
      output.warning('remove', `port cleanup failed: ${error.message}`);
    }

    // Success message
    output.success('remove', `removed worktree '${displayName}'`);

  } catch (error) {
    // Catch-all error handler
    output.error('remove', error.message);
    output.exitInfo('remove', 2, 'unexpected error');
    process.exit(2);
  }
}

module.exports = { removeCommand };