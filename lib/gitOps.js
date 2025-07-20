const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;

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
    
    if (baseBranch && !branchExists) {
      command.push('-b', branchName, worktreePath, baseBranch);
    } else {
      command.push(worktreePath, branchName);
    }

    await this.git.raw(command);
  }

  async removeWorktree(worktreePath, force = false) {
    const command = ['worktree', 'remove', worktreePath];
    if (force) {
      command.push('--force');
    }
    
    await this.git.raw(command);
  }

  async listWorktrees() {
    const output = await this.git.raw(['worktree', 'list', '--porcelain']);
    const worktrees = [];
    
    const lines = output.split('\n');
    let current = {};
    
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push(current);
        }
        current = { path: line.substring(9) };
      } else if (line.startsWith('HEAD ')) {
        current.head = line.substring(5);
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(7);
      } else if (line === '') {
        if (current.path) {
          worktrees.push(current);
          current = {};
        }
      }
    }
    
    if (current.path) {
      worktrees.push(current);
    }

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
    const worktreeGit = simpleGit(worktreePath);
    const status = await worktreeGit.status();
    return !status.isClean();
  }

  async hasUnpushedCommits(worktreePath) {
    const worktreeGit = simpleGit(worktreePath);
    const status = await worktreeGit.status();
    return status.ahead > 0;
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
    return dirPath.includes(path.join('.worktrees', '')) || dirPath.includes('.worktrees' + path.sep);
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