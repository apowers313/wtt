const path = require('path');
const fs = require('fs').promises;
const simpleGit = require('simple-git');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const Output = require('../lib/output');
const PathManager = require('../lib/path-manager');
const Validator = require('../lib/validator');
const rootFinder = require('../lib/rootFinder');

/**
 * Refactored create command using new concise output system
 */
async function createCommand(branchName, options) {
  const output = new Output(options);
  let git, pathManager, validator;

  try {
    // Initialize git and helpers
    const gitRoot = await rootFinder.findGitRoot();
    git = simpleGit(gitRoot);
    pathManager = new PathManager(gitRoot);
    validator = new Validator();

    output.verboseStep('create', 'initializing git repository');

    // Load configuration
    await config.load();
    const cfg = config.get();
    const mainBranch = cfg.mainBranch || 'main';
    const baseBranch = options.from || mainBranch;

    output.verboseStep('create', `base branch: ${baseBranch}`);

    // Validate worktree name
    if (!pathManager.isValidWorktreeName(branchName)) {
      output.error('create', `invalid branch name '${branchName}' (use alphanumeric, hyphens, underscores only)`);
      output.exitInfo('create', 2, 'invalid name');
      process.exit(2);
    }

    // Check if branch already exists
    const targetBranchExists = await checkBranchExists(git, branchName);
    const createNewBranch = !targetBranchExists;

    // Validate create operation
    const validationErrors = await validator.validateCreateOperation(
      git, pathManager, branchName, { 
        requireClean: true, 
        createBranch: createNewBranch 
      }
    );

    if (validationErrors.length > 0) {
      const errorMessage = validationErrors.length === 1 
        ? validationErrors[0]
        : `${validationErrors.length} validation errors`;
      
      output.error('create', errorMessage);
      
      if (options.verbose && validationErrors.length > 1) {
        validationErrors.forEach(error => {
          output.raw(`  - ${error}`);
        });
      }
      
      output.exitInfo('create', 2, 'validation failed');
      process.exit(2);
    }

    // Check if base branch exists
    const baseBranchExists = await checkBranchExists(git, baseBranch);
    if (!baseBranchExists) {
      output.error('create', `base branch '${baseBranch}' not found`);
      output.exitInfo('create', 2, 'invalid base branch');
      process.exit(2);
    }

    // Get paths
    const worktreePath = pathManager.getWorktreePath(branchName);
    const displayName = pathManager.getDisplayName(branchName);

    // Create worktree
    output.status('create', 'creating worktree', `'${displayName}' at ${pathManager.getRelativeFromRoot(worktreePath)}`);

    try {
      // Create the worktree
      const worktreeArgs = ['worktree', 'add', worktreePath];
      
      if (createNewBranch) {
        worktreeArgs.push('-b', branchName, baseBranch);
        output.verboseStep('create', `creating new branch '${branchName}' from '${baseBranch}'`);
      } else {
        worktreeArgs.push(branchName);
        output.verboseStep('create', `using existing branch '${branchName}'`);
      }

      await git.raw(worktreeArgs);
      
      output.verboseStep('create', 'worktree created successfully');

    } catch (error) {
      output.error('create', `failed to create worktree: ${error.message}`);
      output.exitInfo('create', 2, 'worktree creation failed');
      process.exit(2);
    }

    // Initialize port manager and assign ports
    output.verboseStep('create', 'assigning ports');

    try {
      await portManager.init(config.getBaseDir());
      const ports = await portManager.assignPorts(branchName);
      
      output.verboseStep('create', `assigned ports: ${Object.entries(ports).map(([k,v]) => `${k}=${v}`).join(', ')}`);

      // Create .env.worktree file
      const envContent = Object.entries(ports)
        .map(([service, port]) => `${service.toUpperCase()}_PORT=${port}`)
        .join('\n') + '\n';

      const envPath = path.join(worktreePath, '.env.worktree');
      await fs.writeFile(envPath, envContent);
      
      output.verboseStep('create', 'created .env.worktree file');

    } catch (error) {
      output.warning('create', `port assignment failed: ${error.message}`);
    }

    // Success message
    const relativeWorktreePath = pathManager.getRelativeFromRoot(worktreePath);
    if (createNewBranch) {
      output.success('create', `created worktree '${displayName}' with new branch from '${baseBranch}' at ${relativeWorktreePath}`);
    } else {
      output.success('create', `created worktree '${displayName}' for existing branch at ${relativeWorktreePath}`);
    }

  } catch (error) {
    // Catch-all error handler
    output.error('create', error.message);
    output.exitInfo('create', 2, 'unexpected error');
    process.exit(2);
  }
}

/**
 * Check if a branch exists (local or remote)
 */
async function checkBranchExists(git, branchName) {
  try {
    const branches = await git.branch(['--all']);
    return branches.all.some(b => 
      b.name === branchName || 
      b.name === `remotes/origin/${branchName}` ||
      b.name === `origin/${branchName}`
    );
  } catch (error) {
    return false;
  }
}

module.exports = { createCommand };