const simpleGit = require('simple-git');
const PathUtils = require('./pathUtils');
const GitOutputParser = require('./gitOutputParser');

/**
 * Refactored GitOps with proper platform abstraction
 */
class GitOps {
  constructor(workingDirectory = process.cwd()) {
    this.git = simpleGit(workingDirectory);
  }

  async getCurrentBranch() {
    const result = await this.git.branch();
    return result.current;
  }

  async validateRepository() {
    try {
      await this.git.status();
      return true;
    } catch {
      throw new Error('This command must be run inside a git repository. Please navigate to your project folder or run \'git init\' to create a new repository');
    }
  }

  async createWorktree(worktreePath, branch, baseBranch = null) {
    // Always use forward slashes for git commands
    const gitPath = PathUtils.toPosix(worktreePath);
    
    if (baseBranch) {
      // Check if branch already exists
      const branchExists = await this.checkBranchExists(branch);
      if (branchExists) {
        throw new Error(`Branch '${branch}' already exists. Use 'wt switch ${branch}' to work on the existing branch, or choose a different name for your new branch`);
      }
      
      // Create new branch from base branch
      await this.git.raw(['worktree', 'add', '-b', branch, gitPath, baseBranch]);
    } else {
      // Use existing branch
      await this.git.raw(['worktree', 'add', gitPath, branch]);
    }
  }

  async removeWorktree(worktreePath, force = false) {
    // Always use forward slashes for git commands
    const gitPath = PathUtils.toPosix(worktreePath);
    const args = ['worktree', 'remove', gitPath];
    
    if (force) {
      args.push('--force');
    }
    
    await this.git.raw(args);
  }

  async listWorktrees() {
    const output = await this.git.raw(['worktree', 'list']);
    return GitOutputParser.parseWorktreeList(output);
  }

  async hasUncommittedChanges(worktreePath = null) {
    let status;
    
    if (worktreePath) {
      // Use -C to run git in the worktree directory
      const gitPath = PathUtils.toPosix(worktreePath);
      const output = await this.git.raw(['-C', gitPath, 'status', '--porcelain']);
      return output.trim().length > 0;
    } else {
      status = await this.git.status();
      return !status.isClean();
    }
  }

  async hasUnpushedCommits(worktreePath = null) {
    try {
      let output;
      
      if (worktreePath) {
        const gitPath = PathUtils.toPosix(worktreePath);
        output = await this.git.raw(['-C', gitPath, 'log', '@{u}..HEAD', '--oneline']);
      } else {
        output = await this.git.raw(['log', '@{u}..HEAD', '--oneline']);
      }
      
      return GitOutputParser.hasUnpushedCommits(output);
    } catch (error) {
      // No upstream branch configured
      if (error.message.includes('no upstream')) {
        return false;
      }
      throw error;
    }
  }

  async getWorktreeInfo(worktreePath) {
    const gitPath = PathUtils.toPosix(worktreePath);
    const status = await this.git.raw(['-C', gitPath, 'status', '--porcelain']);
    
    const lines = status.split(/\r?\n/).filter(line => line.trim());
    let modified = 0;
    let added = 0;
    let deleted = 0;
    
    lines.forEach(line => {
      const status = line.substring(0, 2);
      if (status.includes('M')) modified++;
      if (status.includes('A')) added++;
      if (status.includes('D')) deleted++;
    });
    
    return { modified, added, deleted, total: lines.length };
  }

  async checkBranchExists(branch) {
    const branches = await this.git.branch();
    return branches.all.includes(branch);
  }

  async deleteBranch(branch, force = false) {
    const args = force ? ['-D', branch] : ['-d', branch];
    await this.git.branch(args);
  }

  async mergeBranch(sourceBranch, targetBranch) {
    await this.git.checkout(targetBranch);
    await this.git.merge([sourceBranch]);
  }

  async pull(branch = null) {
    if (branch) {
      await this.git.pull('origin', branch);
    } else {
      await this.git.pull();
    }
  }

  isWorktreePath(dirPath) {
    return PathUtils.isWorktreePath(dirPath);
  }
}

module.exports = new GitOps();