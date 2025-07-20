const chalk = require('chalk');
const path = require('path');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const { Prompter } = require('../lib/prompter');
const PathUtils = require('../lib/pathUtils');

async function removeCommand(worktreeName, options, prompter = new Prompter()) {
  try {
    await gitOps.validateRepository();
    await config.load();
    
    const cfg = config.get();
    await portManager.init(config.getBaseDir());
    
    const worktreePath = config.getWorktreePath(worktreeName);
    
    const worktrees = await gitOps.listWorktrees();
    const worktree = worktrees.find(wt => PathUtils.equals(wt.path, worktreePath));
    
    if (!worktree) {
      throw new Error(`Worktree '${worktreeName}' not found`);
    }
    
    console.log(chalk.blue(`Checking worktree '${worktreeName}'...`));
    
    if (!options.force) {
      const hasUncommitted = await gitOps.hasUncommittedChanges(worktreePath);
      if (hasUncommitted) {
        console.log(chalk.red('✗ Worktree has uncommitted changes'));
        
        const info = await gitOps.getWorktreeInfo(worktreePath);
        if (info.modified > 0) {
          console.log(chalk.yellow(`  ${info.modified} modified files`));
        }
        
        const confirmRemove = await prompter.confirm(
          'Remove worktree with uncommitted changes?',
          false
        );
        
        if (!confirmRemove) {
          console.log(chalk.yellow('Aborted'));
          return { cancelled: true };
        }
        
        options.force = true;
      }
      
      const hasUnpushed = await gitOps.hasUnpushedCommits(worktreePath);
      if (hasUnpushed) {
        console.log(chalk.yellow('⚠ Branch has unpushed commits'));
        
        const confirmRemove = await prompter.confirm(
          'Remove worktree with unpushed commits?',
          false
        );
        
        if (!confirmRemove) {
          console.log(chalk.yellow('Aborted'));
          return { cancelled: true };
        }
      }
    }
    
    if (!options.force) {
      console.log('\n' + chalk.yellow('This will remove:'));
      console.log(chalk.gray(`  - Worktree at ${worktreePath}`));
      
      const ports = portManager.getPorts(worktreeName);
      if (ports) {
        console.log(chalk.gray(`  - Port assignments: ${portManager.formatPortDisplay(ports)}`));
      }
      
      const confirmFinal = await prompter.confirm(
        'Are you sure you want to remove this worktree?',
        false
      );
      
      if (!confirmFinal) {
        console.log(chalk.yellow('Aborted'));
        return { cancelled: true };
      }
    }
    
    console.log('\n' + chalk.blue('Removing worktree...'));
    
    await gitOps.removeWorktree(worktreePath, options.force);
    console.log('✓ Removed worktree');
    
    const ports = portManager.getPorts(worktreeName);
    if (ports) {
      await portManager.releasePorts(worktreeName);
      console.log(`✓ Released ports ${portManager.formatPortDisplay(ports)}`);
    }
    
    if (worktree.branch) {
      console.log(`\nNote: Branch '${worktree.branch}' still exists.`);
      console.log(`To delete it, run: git branch -d ${worktree.branch}`);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    
    // Don't exit during testing - return error result instead
    if (process.env.NODE_ENV === 'test') {
      return { error: error.message, success: false };
    }
    
    process.exit(1);
  }
}

module.exports = { removeCommand };