/**
 * Error translation utilities for converting technical errors into user-friendly messages
 */

/**
 * Translates git command errors into user-friendly messages
 * @param {Error} error - The error from git command
 * @param {string} context - Additional context about what operation was being performed
 * @returns {string} User-friendly error message
 */
function translateGitError(error, context = '') {
  const message = error.message || error.toString();
  
  // Branch/reference errors
  if (message.includes('fatal: invalid reference')) {
    const branch = message.match(/invalid reference: (.+)/)?.[1];
    return `The branch '${branch}' doesn't exist. Try 'wt create ${branch} --from main' to create it as a new branch.`;
  }
  
  // Worktree already exists
  if (message.includes('already exists')) {
    return 'A worktree already exists at that location. Use \'wt list\' to see all worktrees.';
  }
  
  // Branch already checked out
  if (message.includes('is already checked out at')) {
    const branch = message.match(/'([^']+)' is already checked out/)?.[1];
    return `The branch '${branch}' is already being used by another worktree. Each branch can only be used in one worktree at a time.`;
  }
  
  // Worktree locked
  if (message.includes('is locked')) {
    return 'This worktree is locked by another process. Wait a moment and try again, or use --force to override.';
  }
  
  // Worktree has uncommitted changes
  if (message.includes('contains modified or untracked files')) {
    return 'This worktree has unsaved changes. Save or discard your changes first, or use --force to delete anyway.';
  }
  
  // Not a working tree
  if (message.includes('is not a working tree')) {
    return 'This directory is not a git worktree. Use "wt list" to see valid worktrees.';
  }
  
  // Merge conflicts
  if (message.includes('CONFLICT')) {
    const files = message.match(/CONFLICT.*?: (.+)/g);
    if (files && files.length > 0) {
      return 'There are conflicts in some files that need to be fixed manually. Look for lines marked with <<<<<<<, =======, and >>>>>>> in your files.';
    }
    return 'There are merge conflicts. Fix the conflicts in your files, then commit the changes.';
  }
  
  // Local changes would be overwritten
  if (message.includes('Your local changes') && message.includes('would be overwritten')) {
    return 'You have unsaved changes that would be lost. Save or discard your changes before continuing.';
  }
  
  // Refusing to merge unrelated histories
  if (message.includes('refusing to merge unrelated histories')) {
    return 'These branches don\'t share any common history. This usually means they were created separately. Use --allow-unrelated-histories if you really want to merge them.';
  }
  
  // Branch not fully merged
  if (message.includes('is not fully merged')) {
    const branch = message.match(/branch '([^']+)'/)?.[1];
    return `The branch '${branch}' has changes that haven't been merged yet. Use 'wt merge ${branch}' first, or use -D to force delete.`;
  }
  
  // Cannot delete current branch
  if (message.includes('Cannot delete the branch') && message.includes('currently on')) {
    return 'You can\'t delete the branch you\'re currently on. Switch to a different branch first.';
  }
  
  // Push failures
  if (message.includes('failed to push some refs')) {
    if (message.includes('non-fast-forward')) {
      return 'Your branch is behind the remote. Pull the latest changes first with \'git pull\', then try pushing again.';
    }
    return 'Failed to push your changes. Make sure you have permission and the remote repository exists.';
  }
  
  // Authentication errors
  if (message.includes('Permission denied (publickey)')) {
    return 'Git couldn\'t authenticate with the remote server. Check that your SSH key is set up correctly, or use HTTPS instead.';
  }
  
  if (message.includes('unable to access')) {
    return 'Can\'t connect to the remote repository. Check your internet connection and that the repository URL is correct.';
  }
  
  // Repository errors
  if (message.includes('not a git repository')) {
    return 'This isn\'t a git repository. Navigate to your project folder or run \'git init\' to create one.';
  }
  
  // Permission denied
  if (message.includes('Permission denied')) {
    return 'You don\'t have permission to do that. Check file permissions or try running with sudo.';
  }
  
  // Generic git errors
  if (message.includes('fatal:')) {
    // Extract just the error part after 'fatal:'
    const fatalError = message.match(/fatal: (.+)/)?.[1] || message;
    return `Git error: ${fatalError}`;
  }
  
  // If we have context, add it to help the user
  if (context) {
    return `Failed to ${context}: ${message}`;
  }
  
  // Fallback - return cleaned up message
  return message.replace(/^(error|fatal|warning):\s*/i, '');
}

/**
 * Translates file system errors into user-friendly messages
 * @param {Error} error - The filesystem error
 * @param {string} operation - What operation was being performed
 * @returns {string} User-friendly error message
 */
function translateFSError(error, operation = 'perform operation') {
  switch (error.code) {
  case 'EACCES':
    return `You don't have permission to ${operation}. Check that you own the files or try running with administrator privileges.`;
    
  case 'ENOSPC':
    return 'Your disk is full. Free up some space and try again.';
    
  case 'ENOENT':
    return `The file or folder needed to ${operation} doesn't exist.`;
    
  case 'EEXIST':
    return `Can't ${operation} because a file or folder already exists at that location.`;
    
  case 'EISDIR':
    return `Can't ${operation} because it's a directory, not a file.`;
    
  case 'ENOTDIR':
    return `Can't ${operation} because it's a file, not a directory.`;
    
  case 'EMFILE':
    return 'Too many files are open. Close some programs and try again.';
    
  case 'EROFS':
    return `Can't ${operation} because the file system is read-only.`;
    
  case 'EBUSY':
    return `Can't ${operation} because the file or folder is being used by another program.`;
    
  case 'EINVAL':
    return `Can't ${operation} because of invalid input or corrupted data.`;
    
  default:
    if (error.message) {
      return `Failed to ${operation}: ${error.message}`;
    }
    return `An unexpected error occurred while trying to ${operation}.`;
  }
}

/**
 * Translates JSON parsing errors
 * @param {Error} error - The JSON parse error
 * @param {string} filename - The file being parsed
 * @returns {string} User-friendly error message
 */
function translateJSONError(error, filename) {
  if (error.message.includes('Unexpected token')) {
    return `The configuration file '${filename}' is corrupted or has invalid formatting. Try deleting it and running 'wt init' again.`;
  }
  if (error.message.includes('JSON')) {
    return `Can't read the configuration file '${filename}'. It may be corrupted. Try deleting it and running 'wt init' again.`;
  }
  return error.message;
}

/**
 * Adds helpful context to errors based on the command being run
 * @param {string} message - The error message
 * @param {string} command - The command that was being run
 * @returns {Object} Object with message and optional tips
 */
function addCommandContext(message, command) {
  const tips = [];
  
  switch (command) {
  case 'create':
    if (message.includes('branch') || message.includes('reference')) {
      tips.push('Use "git branch" to see available branches');
      tips.push('Use "--from <branch>" to create a new branch');
    }
    break;
      
  case 'remove':
    if (message.includes('changes')) {
      tips.push('Use "git status" to see what changes you have');
      tips.push('Use "--force" to delete anyway (changes will be lost!)');
    }
    break;
      
  case 'merge':
    if (message.includes('conflict')) {
      tips.push('Fix conflicts manually in your text editor');
      tips.push('Look for <<<<<<< and >>>>>>> markers in files');
      tips.push('After fixing, use "git add" and "git commit"');
    }
    break;
      
  case 'list':
    if (message.includes('configuration')) {
      tips.push('Run "wt init" to set up the worktree tool');
    }
    break;
  }
  
  if (message.includes('worktree')) {
    tips.push('Use "wt list" to see all worktrees');
  }
  
  return { message, tips };
}

module.exports = {
  translateGitError,
  translateFSError,
  translateJSONError,
  addCommandContext
};