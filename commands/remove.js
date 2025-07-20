const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs').promises;
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const PathUtils = require('../lib/pathUtils');

async function removeCommand(worktreeName, options) {
  try {
    await gitOps.validateRepository();
    await config.load();
    
    const cfg = config.get();
    await portManager.init(config.getBaseDir());
    
    const worktreePath = config.getWorktreePath(worktreeName);
    
    const worktrees = await gitOps.listWorktrees();
    const worktree = worktrees.find(wt => PathUtils.equals(wt.path, worktreePath));
    
    // Check if we have tracking data even if git doesn't know about the worktree
    const ports = portManager.getPorts(worktreeName);
    const hasTrackingData = ports || await fs.access(worktreePath).then(() => true).catch(() => false);
    
    if (!worktree && !hasTrackingData) {
      throw new Error(`Worktree '${worktreeName}' not found`);
    }
    
    console.log(chalk.blue(`Checking worktree '${worktreeName}'...`));
    
    if (!options.force && worktree) {
      const hasUncommitted = await gitOps.hasUncommittedChanges(worktreePath);
      if (hasUncommitted) {
        console.log(chalk.red('✗ Worktree has uncommitted changes'));
        
        const info = await gitOps.getWorktreeInfo(worktreePath);
        if (info.modified > 0) {
          console.log(chalk.yellow(`  ${info.modified} modified files`));
        }
        
        let confirmRemove = false;
        
        // In test environment, auto-confirm based on force flag
        if (process.env.NODE_ENV === 'test') {
          confirmRemove = options.force || false;
        } else {
          const result = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmRemove',
            message: 'Remove worktree with uncommitted changes?',
            default: false
          }]);
          confirmRemove = result.confirmRemove;
        }
        
        if (!confirmRemove) {
          console.log(chalk.yellow('Aborted'));
          return;
        }
        
        options.force = true;
      }
      
      const hasUnpushed = worktree ? await gitOps.hasUnpushedCommits(worktreePath) : false;
      if (hasUnpushed) {
        console.log(chalk.yellow('⚠ Branch has unpushed commits'));
        
        let confirmRemove = false;
        
        // In test environment, auto-confirm based on force flag
        if (process.env.NODE_ENV === 'test') {
          confirmRemove = options.force || false;
        } else {
          const result = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmRemove',
            message: 'Remove worktree with unpushed commits?',
            default: false
          }]);
          confirmRemove = result.confirmRemove;
        }
        
        if (!confirmRemove) {
          console.log(chalk.yellow('Aborted'));
          return;
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
      
      let confirmFinal = true;
      
      // In test environment, auto-confirm, otherwise prompt
      if (process.env.NODE_ENV !== 'test') {
        const result = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirmFinal',
          message: 'Are you sure you want to remove this worktree?',
          default: false
        }]);
        confirmFinal = result.confirmFinal;
      }
      
      if (!confirmFinal) {
        console.log(chalk.yellow('Aborted'));
        return;
      }
    }
    
    console.log('\n' + chalk.blue('Removing worktree...'));
    
    // Only remove git worktree if it actually exists
    if (worktree) {
      await gitOps.removeWorktree(worktreePath, options.force);
      console.log(chalk.green('✓ Removed worktree'));
    } else {
      // Clean up any remaining directory if it exists
      try {
        await fs.rm(worktreePath, { recursive: true });
        console.log(chalk.green('✓ Cleaned up worktree directory'));
      } catch (error) {
        // Directory might not exist, that's fine
      }
    }
    
    const assignedPorts = portManager.getPorts(worktreeName);
    if (assignedPorts) {
      await portManager.releasePorts(worktreeName);
      console.log(chalk.green(`✓ Released ports ${portManager.formatPortDisplay(assignedPorts)}`));
    }
    
    if (worktree && worktree.branch) {
      console.log(chalk.gray(`\nNote: Branch '${worktree.branch}' still exists.`));
      console.log(chalk.gray(`To delete it, run: git branch -d ${worktree.branch}`));
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

module.exports = { removeCommand };