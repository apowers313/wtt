const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs').promises;
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const PathUtils = require('../lib/pathUtils');
const { addCommandContext } = require('../lib/errorTranslator');
const { getCurrentWorktree } = require('../lib/currentWorktree');
const Output = require('../lib/output');

async function removeCommand(worktreeName, options) {
  const output = new Output({ verbose: options.verbose });
  
  try {
    await gitOps.validateRepository();
    await config.load();
    
    // Auto-detect current worktree if no name provided
    if (!worktreeName) {
      worktreeName = await getCurrentWorktree();
      if (!worktreeName) {
        throw new Error('No worktree specified and not currently inside a worktree. Use \'wt list\' to see available worktrees.');
      }
      output.verboseStep('remove', `auto-detected current worktree: ${worktreeName}`);
    }
    
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
      throw new Error(`Worktree '${worktreeName}' doesn't exist. Use 'wt list' to see available worktrees`);
    }
    
    
    if (!options.force && worktree) {
      const hasUncommitted = await gitOps.hasUncommittedChanges(worktreePath);
      if (hasUncommitted) {
        
        let confirmRemove = false;
        
        // Auto-confirm in test/automation environments
        if (process.env.WTT_AUTO_CONFIRM === 'true') {
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
        
        // Auto-confirm in test/automation environments
        if (process.env.WTT_AUTO_CONFIRM === 'true') {
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
      
      // Auto-confirm in test/automation environments, otherwise prompt
      if (process.env.WTT_AUTO_CONFIRM !== 'true') {
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
      
      if (!directoryExists) {
        output.success('remove', `cleaned up broken worktree '${worktreeName}'`);
      } else {
        output.success('remove', `removed worktree '${worktreeName}'`);
      }
    } else {
      // Clean up any remaining directory if it exists
      try {
        await fs.rm(worktreePath, { recursive: true });
        output.success('remove', `removed worktree '${worktreeName}'`);
      } catch (error) {
        // Directory might not exist, that's fine
        output.success('remove', `cleaned up tracking for '${worktreeName}'`);
      }
    }
    
    const assignedPorts = portManager.getPorts(worktreeName);
    if (assignedPorts) {
      await portManager.releasePorts(worktreeName);
      output.verboseStep('remove', `released ports ${portManager.formatPortDisplay(assignedPorts)}`);
    }
    
    if (worktree && worktree.branch && options.verbose) {
      output.raw(`\nNote: Branch '${worktree.branch}' still exists.`);
      output.raw(`To delete it, run: git branch -d ${worktree.branch}`);
    }
    
  } catch (error) {
    output.error('remove', error.message);
    const context = addCommandContext(error.message, 'remove');
    if (context.tips && context.tips.length > 0 && options.verbose) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

module.exports = { removeCommand };