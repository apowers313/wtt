const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
const PathUtils = require('./pathUtils');
const GitOutputParser = require('./gitOutputParser');

class GitOps {
  constructor() {
    this.git = simpleGit();
  }

  async getCurrentBranch() {
    const status = await this.git.status();
    return status.current;
  }

  async getMainBranch(config) {
    return config.mainBranch || 'main';
  }

  async createWorktree(worktreePath, branchName, baseBranch = null) {

    const branches = await this.git.branch();
    const branchExists = branches.all.includes(branchName);


    if (branchExists && baseBranch) {
      throw new Error(`Branch '${branchName}' already exists`);
    }

    let command = ['worktree', 'add'];
    
    // Convert path to POSIX format for git commands
    const gitPath = PathUtils.toPosix(worktreePath);
    
    if (baseBranch && !branchExists) {
      command.push('-b', branchName, gitPath, baseBranch);
    } else {
      command.push(gitPath, branchName);
    }


    try {
      const result = await this.git.raw(command);
      
    } catch (error) {
      throw error;
    }
  }

  async removeWorktree(worktreePath, force = false) {
    // Convert path to POSIX format for git commands
    const gitPath = PathUtils.toPosix(worktreePath);
    const command = ['worktree', 'remove', gitPath];
    if (force) {
      command.push('--force');
    }
    
    await this.git.raw(command);
  }

  async listWorktrees() {
    // Use regular list format which is more reliable than porcelain
    const output = await this.git.raw(['worktree', 'list']);
    

    // Use GitOutputParser for consistent parsing
    const worktrees = GitOutputParser.parseWorktreeList(output);
    

    return worktrees;
  }

  async getWorktreeInfo(worktreePath) {
    const worktreeGit = simpleGit(worktreePath);
    const status = await worktreeGit.status();
    const log = await worktreeGit.log({ maxCount: 1 });
    
    return {
      branch: status.current,
      modified: status.modified.length,
      ahead: status.ahead,
      behind: status.behind,
      uncommitted: !status.isClean(),
      lastCommit: log.latest
    };
  }

  async hasUncommittedChanges(worktreePath) {
    // Use -C flag to run git in the worktree directory
    const gitPath = PathUtils.toPosix(worktreePath);
    const output = await this.git.raw(['-C', gitPath, 'status', '--porcelain']);
    return output.trim().length > 0;
  }

  async hasUnpushedCommits(worktreePath) {
    try {
      // Use -C flag to run git in the worktree directory
      const gitPath = PathUtils.toPosix(worktreePath);
      const output = await this.git.raw(['-C', gitPath, 'log', '@{u}..HEAD', '--oneline']);
      return output.trim().length > 0;
    } catch (error) {
      // No upstream branch configured
      if (error.message.includes('no upstream')) {
        return false;
      }
      throw error;
    }
  }

  async mergeBranch(branchName, mainBranch) {
    await this.git.checkout(mainBranch);
    await this.git.merge([branchName]);
  }

  async deleteBranch(branchName, force = false) {
    const command = ['branch'];
    command.push(force ? '-D' : '-d');
    command.push(branchName);
    
    await this.git.raw(command);
  }

  async fetch() {
    await this.git.fetch();
  }

  async checkBranchExists(branchName) {
    const branches = await this.git.branch();
    return branches.all.includes(branchName);
  }

  async checkRemoteBranchExists(branchName) {
    const branches = await this.git.branch(['-r']);
    return branches.all.some(b => b.endsWith(`/${branchName}`));
  }

  async push(branch, setUpstream = false) {
    if (setUpstream) {
      await this.git.push(['--set-upstream', 'origin', branch]);
    } else {
      await this.git.push('origin', branch);
    }
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

  async validateRepository() {
    try {
      await this.git.status();
      return true;
    } catch {
      throw new Error('Not in a git repository');
    }
  }
}

module.exports = new GitOps();