const path = require('path');
const simpleGit = require('simple-git');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const Output = require('../lib/output');
const PathManager = require('../lib/path-manager');
const Validator = require('../lib/validator');
const rootFinder = require('../lib/rootFinder');

/**
 * Refactored list command using new concise output system
 */
async function listCommand(options) {
  const output = new Output(options);
  let git, pathManager, validator;

  try {
    // Initialize git and helpers
    const gitRoot = await rootFinder.findGitRoot();
    git = simpleGit(gitRoot);
    pathManager = new PathManager(gitRoot);
    validator = new Validator();

    output.verboseStep('list', 'initializing git repository');

    // Validate repository
    const repoErrors = await validator.validateRepository(git);
    if (repoErrors.length > 0) {
      output.error('list', repoErrors[0]);
      output.exitInfo('list', 2, 'repository validation failed');
      process.exit(2);
    }

    // Load configuration
    await config.load();
    await portManager.init(config.getBaseDir());

    output.verboseStep('list', 'loading worktree information');

    // Get worktrees from git
    const worktrees = await getWorktrees(git);
    
    // Filter to only show managed worktrees (in .worktrees directory)
    const managedWorktrees = worktrees.filter(wt => 
      pathManager.isInWorktree(wt.path)
    );

    if (managedWorktrees.length === 0) {
      output.success('list', 'no worktrees found');
      return;
    }

    // Display format based on verbose flag
    if (options.verbose) {
      await displayVerboseList(output, managedWorktrees, pathManager, portManager, git);
    } else {
      await displayConciseList(output, managedWorktrees, pathManager);
    }

  } catch (error) {
    output.error('list', error.message);
    output.exitInfo('list', 2, 'unexpected error');
    process.exit(2);
  }
}

/**
 * Get worktrees from git with error handling
 */
async function getWorktrees(git) {
  try {
    const result = await git.raw(['worktree', 'list', '--porcelain']);
    const worktrees = [];
    const lines = result.split('\n');
    
    let current = {};
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current);
        current = { path: line.substring(9) };
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(7);
      } else if (line === 'bare') {
        current.bare = true;
      }
    }
    if (current.path) worktrees.push(current);
    
    return worktrees;
  } catch (error) {
    throw new Error(`failed to list worktrees: ${error.message}`);
  }
}

/**
 * Display concise worktree list (normal mode)
 */
async function displayConciseList(output, worktrees, pathManager) {
  const count = worktrees.length;
  const names = worktrees.map(wt => {
    const worktreeName = path.basename(wt.path);
    return pathManager.getDisplayName(worktreeName);
  });
  
  output.success('list', `${count} worktrees: ${names.join(', ')}`);
}

/**
 * Display detailed worktree list (verbose mode)
 */
async function displayVerboseList(output, worktrees, pathManager, portManager, git) {
  output.raw('WORKTREE           BRANCH         PORTS              STATUS');
  output.raw('─'.repeat(70));
  
  for (const worktree of worktrees) {
    const worktreeName = path.basename(worktree.path);
    const displayName = pathManager.getDisplayName(worktreeName);
    const branch = worktree.branch || 'unknown';
    
    // Get port information
    const ports = portManager.getPorts(worktreeName);
    let portStr = '';
    if (ports) {
      const portsList = Object.entries(ports)
        .map(([service, port]) => `${service}:${port}`)
        .join(' ');
      portStr = portsList.length > 18 ? portsList.substring(0, 15) + '...' : portsList;
    }
    
    // Get status information
    let status = '';
    try {
      await git.cwd(worktree.path);
      const gitStatus = await git.status();
      if (!gitStatus.isClean()) {
        status = `${gitStatus.files.length} changes`;
      } else {
        status = 'clean';
      }
    } catch (error) {
      status = 'error';
    }
    
    // Format the line
    const line = displayName.padEnd(18) + ' ' +
                 branch.padEnd(14) + ' ' +
                 portStr.padEnd(18) + ' ' +
                 status;
    
    output.raw(line);
  }
  
  output.verboseStep('list', `displayed ${worktrees.length} worktrees`);
}

module.exports = { listCommand };