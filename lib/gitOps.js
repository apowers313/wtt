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
    if (process.env.CI || process.env.DEBUG_TESTS) {
      console.log('\n[DEBUG] GitOps.createWorktree:');
      console.log('  Platform:', process.platform);
      console.log('  Worktree path:', worktreePath);
      console.log('  Branch name:', branchName);
      console.log('  Base branch:', baseBranch);
    }

    const branches = await this.git.branch();
    const branchExists = branches.all.includes(branchName);

    if (process.env.CI || process.env.DEBUG_TESTS) {
      console.log('  Branch exists:', branchExists);
      console.log('  All branches:', branches.all);
    }

    if (branchExists && baseBranch) {
      throw new Error(`Branch '${branchName}' already exists`);
    }

    let command = ['worktree', 'add'];
    
    if (baseBranch && !branchExists) {
      command.push('-b', branchName, worktreePath, baseBranch);
    } else {
      command.push(worktreePath, branchName);
    }

    if (process.env.CI || process.env.DEBUG_TESTS) {
      console.log('  Git command:', ['git'].concat(command).join(' '));
    }

    try {
      const result = await this.git.raw(command);
      
      if (process.env.CI || process.env.DEBUG_TESTS) {
        console.log('  Command succeeded');
        console.log('  Result:', result);
      }
    } catch (error) {
      if (process.env.CI || process.env.DEBUG_TESTS) {
        console.log('  Command failed:', error.message);
        console.log('  Error details:', JSON.stringify({
          message: error.message,
          code: error.code,
          signal: error.signal
        }, null, 2));
      }
      throw error;
    }
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
    
    // Debug logging for CI
    if (process.env.CI || process.env.DEBUG_TESTS) {
      console.log('\n[DEBUG] GitOps.listWorktrees:');
      console.log('  Platform:', process.platform);
      console.log('  Raw git output length:', output.length);
      console.log('  Raw git output:', JSON.stringify(output.substring(0, 500)));
      if (output.length > 500) {
        console.log('  ... (truncated, total length:', output.length, ')');
      }
    }
    
    // Handle different line endings on Windows
    const lines = output.split(/\r?\n/);
    let current = {};
    
    if (process.env.CI || process.env.DEBUG_TESTS) {
      console.log('  Split into', lines.length, 'lines');
      lines.forEach((line, index) => {
        if (line.trim()) {
          console.log(`    Line ${index}: "${line}" (length: ${line.length})`);
        }
      });
    }
    
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push(current);
        }
        current = { path: line.substring(9) };
        
        if (process.env.CI || process.env.DEBUG_TESTS) {
          console.log('    Found worktree path:', current.path);
        }
      } else if (line.startsWith('HEAD ')) {
        current.head = line.substring(5);
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(7);
        
        if (process.env.CI || process.env.DEBUG_TESTS) {
          console.log('    Found branch:', current.branch);
        }
      } else if (line === '') {
        if (current.path) {
          worktrees.push(current);
          
          if (process.env.CI || process.env.DEBUG_TESTS) {
            console.log('    Completed worktree:', JSON.stringify(current));
          }
          
          current = {};
        }
      }
    }
    
    if (current.path) {
      worktrees.push(current);
      
      if (process.env.CI || process.env.DEBUG_TESTS) {
        console.log('    Final worktree:', JSON.stringify(current));
      }
    }

    if (process.env.CI || process.env.DEBUG_TESTS) {
      console.log('  Total worktrees found:', worktrees.length);
      worktrees.forEach((wt, index) => {
        console.log(`    ${index}: ${wt.path} (${wt.branch || 'no branch'})`);
      });
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