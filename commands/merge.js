const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const PathUtils = require('../lib/pathUtils');

async function mergeCommand(worktreeName, options) {
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
    
    const branchName = worktree.branch;
    if (!branchName) {
      throw new Error('Could not determine branch name for worktree');
    }
    
    console.log(chalk.blue(`Checking worktree '${worktreeName}'...`));
    
    const hasUncommitted = await gitOps.hasUncommittedChanges(worktreePath);
    if (hasUncommitted) {
      console.log(chalk.red('✗ Worktree has uncommitted changes'));
      console.log(chalk.yellow('Please commit or stash changes before merging'));
      process.exit(1);
    }
    console.log(chalk.green('✓ No uncommitted changes'));
    
    const hasUnpushed = await gitOps.hasUnpushedCommits(worktreePath);
    if (hasUnpushed) {
      console.log(chalk.yellow('⚠ Branch has unpushed commits'));
      let shouldPush = true;
      
      // In test environment, auto-confirm push, otherwise prompt
      if (process.env.NODE_ENV !== 'test') {
        const result = await inquirer.prompt([{
          type: 'confirm',
          name: 'shouldPush',
          message: 'Push commits to origin before merging?',
          default: true
        }]);
        shouldPush = result.shouldPush;
      }
      
      if (shouldPush) {
        const worktreeGit = require('simple-git')(worktreePath);
        await worktreeGit.push();
        console.log(chalk.green('✓ Pushed commits to origin'));
      }
    } else {
      console.log(chalk.green('✓ Branch is up to date with origin'));
    }
    
    const mainBranch = await gitOps.getMainBranch(cfg);
    console.log('\n' + chalk.blue(`Merging to ${mainBranch}...`));
    
    await gitOps.mergeBranch(branchName, mainBranch);
    console.log(chalk.green(`✓ Switched to branch '${mainBranch}'`));
    console.log(chalk.green(`✓ Merged '${branchName}'`));
    
    if (options.delete) {
      let confirmDelete = true;
      
      // In test environment, auto-confirm deletions, otherwise prompt
      if (process.env.NODE_ENV !== 'test') {
        const result = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirmDelete',
          message: 'Delete worktree and branch?',
          default: true
        }]);
        confirmDelete = result.confirmDelete;
      }
      
      if (confirmDelete) {
        await gitOps.removeWorktree(worktreePath);
        console.log(chalk.green('✓ Removed worktree'));
        
        try {
          await gitOps.deleteBranch(branchName);
          console.log(chalk.green(`✓ Deleted branch '${branchName}'`));
        } catch (error) {
          console.log(chalk.yellow(`⚠ Could not delete branch: ${error.message}`));
        }
        
        const ports = portManager.getPorts(worktreeName);
        if (ports) {
          await portManager.releasePorts(worktreeName);
          const portList = Object.values(ports).join(', ');
          console.log(chalk.green(`✓ Released ports ${portList}`));
        }
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

module.exports = { mergeCommand };