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
    
    await portManager.init(config.getBaseDir());
    
    const worktreePath = config.getWorktreePath(worktreeName);
    
    const worktrees = await gitOps.listWorktrees();
    let worktree = worktrees.find(wt => PathUtils.equals(wt.path, worktreePath));
    
    // Fallback: Try matching by worktree name if path matching fails
    if (!worktree) {
      worktree = worktrees.find(wt => {
        const wtName = path.basename(wt.path);
        return wtName === worktreeName;
      });
    }
    
    // Check if we have tracking data even if git doesn't know about the worktree
    const ports = portManager.getPorts(worktreeName);
    const hasTrackingData = ports || await fs.access(worktreePath).then(() => true).catch(() => false);
    
    if (!worktree && !hasTrackingData) {
      throw new Error(`Worktree '${worktreeName}' not found`);
    }
    
    
    if (!options.force && worktree) {
      const hasUncommitted = await gitOps.hasUncommittedChanges(worktreePath);
      if (hasUncommitted) {
        
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
          return;
        }
        
        options.force = true;
      }
      
      const hasUnpushed = worktree ? await gitOps.hasUnpushedCommits(worktreePath) : false;
      if (hasUnpushed) {
        
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
          return;
        }
      }
    }
    
    if (!options.force) {
      
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
        return;
      }
    }
    
    
    // Only remove git worktree if it actually exists
    if (worktree) {
      // Check if this is a broken worktree (directory doesn't exist)
      const directoryExists = await fs.access(worktreePath).then(() => true).catch(() => false);
      
      await gitOps.removeWorktree(worktreePath, options.force);
      console.log(chalk.green('✓ Removed worktree'));
      
      if (!directoryExists) {
        console.log(chalk.green('✓ Cleaned up broken worktree registration'));
      }
    } else {
      // Clean up any remaining directory if it exists
      try {
        await fs.rm(worktreePath, { recursive: true });
        console.log(chalk.green('✓ Removed worktree directory'));
      } catch (error) {
        // Directory might not exist, that's fine
        console.log(chalk.green('✓ Cleaned up worktree tracking'));
      }
    }
    
    const assignedPorts = portManager.getPorts(worktreeName);
    if (assignedPorts) {
      await portManager.releasePorts(worktreeName);
      console.log(`✓ Released ports ${portManager.formatPortDisplay(assignedPorts)}`);
    }
    
    if (worktree && worktree.branch) {
      console.log(`\nNote: Branch '${worktree.branch}' still exists.`);
      console.log(`To delete it, run: git branch -d ${worktree.branch}`);
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

module.exports = { removeCommand };