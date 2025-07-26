const chalk = require('chalk');
const path = require('path');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const { addCommandContext } = require('../lib/errorTranslator');
const Output = require('../lib/output');

async function listCommand(options) {
  const output = new Output({ verbose: options.verbose });
  
  try {
    await gitOps.validateRepository();
    await config.load();
    
    await portManager.init(config.getBaseDir());
    
    const worktrees = await gitOps.listWorktrees();
    
    // Filter to only show managed worktrees (those in .worktrees directory)
    // This simple check works across platforms and avoids path normalization issues
    const managedWorktrees = worktrees.filter(wt => {
      return wt.path.includes('/.worktrees/') || wt.path.includes('\\.worktrees\\');
    });
    
    if (managedWorktrees.length === 0) {
      output.success('list', 'no worktrees found');
      return;
    }
    
    if (options.verbose) {
      // Verbose mode - show detailed table
      output.raw('\nWORKTREE           BRANCH         PORTS              STATUS');
      output.raw('─'.repeat(70));
      
      for (const worktree of managedWorktrees) {
        const worktreeName = path.basename(worktree.path);
        const ports = portManager.getPorts(worktreeName);
        const runningPorts = await portManager.getRunningPorts(worktreeName);
        
        let info;
        try {
          info = await gitOps.getWorktreeInfo(worktree.path);
        } catch (error) {
          info = { branch: worktree.branch || 'unknown', error: true };
        }
        
        output.raw(worktreeName.padEnd(18) + ' ' + 
                   (info.branch || 'unknown').padEnd(14));
        
        if (ports) {
          for (const [service, port] of Object.entries(ports)) {
            const isRunning = runningPorts[service];
            const portStr = `${service}:${port}`;
            const status = isRunning ? chalk.green('✓') : ' ';
            output.raw(' '.repeat(33) + portStr.padEnd(18) + status);
          }
        } else {
          output.raw(' '.repeat(33) + 'No ports assigned');
        }
        
        if (!info.error) {
          const statusLines = [];
          
          if (info.ahead > 0) {
            statusLines.push(`${info.ahead} commits ahead`);
          }
          if (info.behind > 0) {
            statusLines.push(`${info.behind} commits behind`);
          }
          if (info.modified > 0) {
            statusLines.push(chalk.yellow(`${info.modified} files modified`));
          }
          if (info.uncommitted) {
            statusLines.push(chalk.yellow('Uncommitted changes'));
          } else if (statusLines.length === 0) {
            statusLines.push(chalk.green('Clean'));
          }
          
          statusLines.forEach((line, i) => {
            if (i === 0) {
              output.raw(' '.repeat(52) + line);
            } else {
              output.raw(' '.repeat(52) + line);
            }
          });
        }
        
        output.raw('');
      }
    } else {
      // Concise mode - single line summary
      const worktreeList = managedWorktrees.map(wt => path.basename(wt.path)).join(', ');
      output.success('list', `found ${managedWorktrees.length} worktrees: ${worktreeList}`);
    }
    
  } catch (error) {
    output.error('list', error.message);
    const context = addCommandContext(error.message, 'list');
    if (context.tips && context.tips.length > 0 && options.verbose) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

module.exports = { listCommand };