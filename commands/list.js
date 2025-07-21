const chalk = require('chalk');
const path = require('path');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');

async function listCommand(options) {
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
      console.log('No worktrees found.');
      return;
    }
    
    if (options.verbose) {
      console.log('\nWORKTREE           BRANCH         PORTS              STATUS');
      console.log('─'.repeat(70));
      
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
        
        console.log(worktreeName.padEnd(18) + ' ' + 
                   (info.branch || 'unknown').padEnd(14));
        
        if (ports) {
          for (const [service, port] of Object.entries(ports)) {
            const isRunning = runningPorts[service];
            const portStr = `${service}:${port}`;
            const status = isRunning ? chalk.green('✓') : ' ';
            console.log(' '.repeat(33) + portStr.padEnd(18) + status);
          }
        } else {
          console.log(' '.repeat(33) + 'No ports assigned');
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
              console.log(' '.repeat(52) + line);
            } else {
              console.log(' '.repeat(52) + line);
            }
          });
        }
        
        console.log();
      }
    } else {
      console.log('\nWorktrees:');
      for (const worktree of managedWorktrees) {
        const worktreeName = path.basename(worktree.path);
        const ports = portManager.getPorts(worktreeName);
        const portDisplay = ports ? portManager.formatPortDisplay(ports) : 'No ports';
        
        console.log(`  ${worktreeName} (${worktree.branch || 'unknown'}) - ${portDisplay}`);
      }
      console.log('\nUse --verbose for detailed information');
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

module.exports = { listCommand };