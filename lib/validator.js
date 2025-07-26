const fs = require('fs').promises;

/**
 * Pre-operation validation system to prevent failures and improve reliability
 * 
 * Design principles:
 * - Validate all preconditions before starting operations
 * - Return clear, actionable error messages
 * - Check git state, file system, and worktree integrity
 * - Avoid operations that will fail due to environment issues
 */
class Validator {
  constructor() {
    // Validator is stateless
  }

  /**
   * Validate worktree operation preconditions
   * Returns array of error messages (empty if valid)
   */
  async validateWorktreeOperation(git, pathManager, worktreeName, options = {}) {
    const errors = [];
    
    try {
      // Check if we're in a git repository
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        errors.push('not in a git repository');
        return errors; // No point checking further
      }

      // Check if worktree exists (if required)
      if (options.requireExists !== false) {
        const worktreeExists = await pathManager.worktreeExists(worktreeName);
        if (!worktreeExists) {
          errors.push(`worktree '${worktreeName}' not found`);
        }
      }

      // Check for uncommitted changes (if required)
      if (options.requireClean !== false) {
        const status = await git.status();
        if (!status.isClean()) {
          const fileCount = status.files.length;
          errors.push(`${fileCount} uncommitted changes in repository`);
        }
      }

      // Check git worktree list consistency
      if (options.checkGitWorktrees !== false) {
        try {
          const gitWorktrees = await git.raw(['worktree', 'list', '--porcelain']);
          const worktreePath = pathManager.getWorktreePath(worktreeName);
          
          // Check if git knows about this worktree
          if (options.requireExists !== false && !gitWorktrees.includes(worktreePath)) {
            errors.push(`git doesn't recognize worktree at ${worktreePath}`);
          }
        } catch (error) {
          errors.push(`failed to check git worktree status: ${error.message}`);
        }
      }

      // Check if detached HEAD (common source of issues)
      if (options.checkBranch !== false) {
        try {
          const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
          if (currentBranch === 'HEAD') {
            errors.push('repository is in detached HEAD state');
          }
        } catch (error) {
          errors.push(`failed to check current branch: ${error.message}`);
        }
      }

    } catch (error) {
      errors.push(`validation failed: ${error.message}`);
    }

    return errors;
  }

  /**
   * Validate merge operation specifically
   */
  async validateMergeOperation(git, pathManager, worktreeName, targetBranch, options = {}) {
    const errors = [];
    
    // Run basic worktree validation
    const basicErrors = await this.validateWorktreeOperation(git, pathManager, worktreeName, {
      requireExists: true,
      requireClean: true,
      checkGitWorktrees: true,
      checkBranch: true
    });
    errors.push(...basicErrors);

    // If basic validation failed, don't continue
    if (basicErrors.length > 0) {
      return errors;
    }

    try {
      // Check if target branch exists
      const branches = await git.branch(['--all']);
      const branchExists = branches.all.some(b => 
        b.name === targetBranch || b.name === `remotes/origin/${targetBranch}`
      );
      
      if (!branchExists) {
        errors.push(`target branch '${targetBranch}' not found`);
      }

      // Check if worktree branch exists and is different from target
      const worktreePath = pathManager.getWorktreePath(worktreeName);
      try {
        await git.cwd(worktreePath);
        const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
        
        if (currentBranch === targetBranch) {
          errors.push(`worktree is already on target branch '${targetBranch}'`);
        }
      } catch (error) {
        errors.push(`failed to check worktree branch: ${error.message}`);
      }

      // Check for uncommitted changes in worktree specifically
      try {
        await git.cwd(worktreePath);
        const status = await git.status();
        if (!status.isClean()) {
          errors.push(`uncommitted changes in worktree '${worktreeName}'`);
        }
      } catch (error) {
        errors.push(`failed to check worktree status: ${error.message}`);
      }

    } catch (error) {
      errors.push(`merge validation failed: ${error.message}`);
    }

    return errors;
  }

  /**
   * Validate create operation
   */
  async validateCreateOperation(git, pathManager, branchName, options = {}) {
    const errors = [];
    
    // Run basic git validation
    const basicErrors = await this.validateWorktreeOperation(git, pathManager, branchName, {
      requireExists: false, // We're creating it
      requireClean: options.requireClean !== false,
      checkGitWorktrees: false, // Not relevant for creation
      checkBranch: true
    });
    errors.push(...basicErrors);

    try {
      // Check if worktree already exists
      const worktreeExists = await pathManager.worktreeExists(branchName);
      if (worktreeExists) {
        errors.push(`worktree '${branchName}' already exists`);
      }

      // Validate worktree name format
      if (!pathManager.isValidWorktreeName(branchName)) {
        errors.push(`invalid worktree name '${branchName}' (use alphanumeric, hyphens, underscores only)`);
      }

      // Check if branch already exists (when creating new branch)
      if (options.createBranch) {
        const branches = await git.branch(['--all']);
        const branchExists = branches.all.some(b => 
          b.name === branchName || b.name === `remotes/origin/${branchName}`
        );
        
        if (branchExists) {
          errors.push(`branch '${branchName}' already exists`);
        }
      }

      // Ensure worktree base directory can be created
      try {
        await pathManager.ensureWorktreeBase();
      } catch (error) {
        errors.push(`cannot create worktree directory: ${error.message}`);
      }

    } catch (error) {
      errors.push(`create validation failed: ${error.message}`);
    }

    return errors;
  }

  /**
   * Validate remove operation
   */
  async validateRemoveOperation(git, pathManager, worktreeName, options = {}) {
    const errors = [];
    
    // Run basic worktree validation
    const basicErrors = await this.validateWorktreeOperation(git, pathManager, worktreeName, {
      requireExists: true,
      requireClean: !options.force, // Allow dirty if forced
      checkGitWorktrees: true,
      checkBranch: false // Don't care about detached head for removal
    });
    errors.push(...basicErrors);

    try {
      // Check if we're currently in the worktree being removed
      const currentPath = process.cwd();
      const worktreePath = pathManager.getWorktreePath(worktreeName);
      
      if (currentPath.startsWith(worktreePath)) {
        errors.push(`cannot remove worktree while inside it (current directory: ${currentPath})`);
      }

    } catch (error) {
      errors.push(`remove validation failed: ${error.message}`);
    }

    return errors;
  }

  /**
   * Validate repository state for any operation
   */
  async validateRepository(git) {
    const errors = [];
    
    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        errors.push('not in a git repository');
        return errors;
      }

      // Check if git is responsive
      await git.raw(['--version']);
      
    } catch (error) {
      errors.push(`git repository validation failed: ${error.message}`);
    }

    return errors;
  }

  /**
   * Format validation errors for display
   */
  formatErrors(errors, operation = 'operation') {
    if (errors.length === 0) {
      return null;
    }

    if (errors.length === 1) {
      return `cannot ${operation}: ${errors[0]}`;
    }

    return `cannot ${operation}:\n${errors.map(e => `  - ${e}`).join('\n')}`;
  }

  /**
   * Quick validation helper that throws on errors
   */
  async validateOrThrow(validationResult, operation = 'operation') {
    if (validationResult.length > 0) {
      throw new Error(this.formatErrors(validationResult, operation));
    }
  }
}

module.exports = Validator;