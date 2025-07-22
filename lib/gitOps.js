const simpleGit = require('simple-git');
const PathUtils = require('./pathUtils');
const GitOutputParser = require('./gitOutputParser');
const { translateGitError } = require('./errorTranslator');
const rootFinder = require('./rootFinder');

class GitOps {
  constructor() {
    this.git = null;
    this.mainRoot = null;
  }

  async ensureGit() {
    if (!this.git) {
      try {
        this.mainRoot = await rootFinder.getMainRepoRoot();
        this.git = simpleGit(this.mainRoot);
      } catch (error) {
        // If we can't find a root, just use current directory
        this.git = simpleGit();
      }
    }
    return this.git;
  }

  async getCurrentBranch() {
    const git = await this.ensureGit();
    const status = await git.status();
    return status.current;
  }

  async getMainBranch(config) {
    return config.mainBranch || 'main';
  }

  async createWorktree(worktreePath, branchName, baseBranch = null) {
    const git = await this.ensureGit();
    const branches = await git.branch();
    const branchExists = branches.all.includes(branchName);


    if (branchExists && baseBranch) {
      throw new Error(`Branch '${branchName}' already exists. Use 'wt switch ${branchName}' to work on the existing branch, or choose a different name for your new branch`);
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
      await git.raw(command);
    } catch (error) {
      throw new Error(translateGitError(error, 'create worktree'));
    }
  }

  async removeWorktree(worktreePath, force = false) {
    const git = await this.ensureGit();
    // Convert path to POSIX format for git commands
    const gitPath = PathUtils.toPosix(worktreePath);
    const command = ['worktree', 'remove', gitPath];
    if (force) {
      command.push('--force');
    }
    
    try {
      await git.raw(command);
    } catch (error) {
      throw new Error(translateGitError(error, 'remove worktree'));
    }
  }

  async listWorktrees() {
    const git = await this.ensureGit();
    try {
      // Use regular list format which is more reliable than porcelain
      const output = await git.raw(['worktree', 'list']);
      
      // Use GitOutputParser for consistent parsing
      const worktrees = GitOutputParser.parseWorktreeList(output);
      
      return worktrees;
    } catch (error) {
      throw new Error(translateGitError(error, 'list worktrees'));
    }
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
    const git = await this.ensureGit();
    try {
      // Use -C flag to run git in the worktree directory
      const gitPath = PathUtils.toPosix(worktreePath);
      const output = await git.raw(['-C', gitPath, 'status', '--porcelain']);
      return output.trim().length > 0;
    } catch (error) {
      throw new Error(translateGitError(error, 'check for uncommitted changes'));
    }
  }

  async hasUnpushedCommits(worktreePath) {
    const git = await this.ensureGit();
    try {
      // Use -C flag to run git in the worktree directory
      const gitPath = PathUtils.toPosix(worktreePath);
      const output = await git.raw(['-C', gitPath, 'log', '@{u}..HEAD', '--oneline']);
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
    const git = await this.ensureGit();
    try {
      await git.checkout(mainBranch);
      await git.merge([branchName]);
    } catch (error) {
      throw new Error(translateGitError(error, `merge ${branchName} into ${mainBranch}`));
    }
  }

  async deleteBranch(branchName, force = false) {
    const git = await this.ensureGit();
    try {
      const command = ['branch'];
      command.push(force ? '-D' : '-d');
      command.push(branchName);
      
      await git.raw(command);
    } catch (error) {
      throw new Error(translateGitError(error, `delete branch ${branchName}`));
    }
  }

  async fetch() {
    const git = await this.ensureGit();
    await git.fetch();
  }

  async checkBranchExists(branchName) {
    const git = await this.ensureGit();
    try {
      const branches = await git.branch();
      return branches.all.includes(branchName);
    } catch (error) {
      throw new Error(translateGitError(error, `check if branch ${branchName} exists`));
    }
  }

  async checkRemoteBranchExists(branchName) {
    const git = await this.ensureGit();
    const branches = await git.branch(['-r']);
    return branches.all.some(b => b.endsWith(`/${branchName}`));
  }

  async push(branch, setUpstream = false) {
    const git = await this.ensureGit();
    try {
      if (setUpstream) {
        await git.push(['--set-upstream', 'origin', branch]);
      } else {
        await git.push('origin', branch);
      }
    } catch (error) {
      throw new Error(translateGitError(error, `push branch ${branch} to remote`));
    }
  }

  async pull(branch = null) {
    const git = await this.ensureGit();
    try {
      if (branch) {
        await git.pull('origin', branch);
      } else {
        await git.pull();
      }
    } catch (error) {
      throw new Error(translateGitError(error, `pull changes${branch ? ' for ' + branch : ''}`));
    }
  }

  isWorktreePath(dirPath) {
    return PathUtils.isWorktreePath(dirPath);
  }

  async validateRepository() {
    try {
      const git = await this.ensureGit();
      await git.status();
      return true;
    } catch {
      throw new Error('This command must be run inside a git repository. Please navigate to your project folder or run \'git init\' to create a new repository');
    }
  }
}

module.exports = new GitOps();