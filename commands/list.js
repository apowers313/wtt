const chalk = require('chalk');
const path = require('path');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const PathUtils = require('../lib/pathUtils');

async function listCommand(options) {
  try {
    await gitOps.validateRepository();
    await config.load();
    
    const cfg = config.get();
    await portManager.init(config.getBaseDir());
    
    const worktrees = await gitOps.listWorktrees();
    const managedWorktrees = worktrees.filter(wt => {
      // Normalize paths for cross-platform comparison using PathUtils
      const normalizedPath = PathUtils.normalize(wt.path);
      const normalizedBaseDir = PathUtils.normalize(cfg.baseDir);
      const normalizedCwd = PathUtils.normalize(process.cwd());
      return normalizedPath.includes(normalizedBaseDir) && 
        !normalizedPath.endsWith(normalizedCwd);
    });
    
    if (managedWorktrees.length === 0) {
      console.log(chalk.yellow('No worktrees found.'));
      return;
    }
    
    if (options.verbose) {
      console.log(chalk.bold('\nWORKTREE           BRANCH         PORTS              STATUS'));
      console.log(chalk.gray('─'.repeat(70)));
      
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
        
        console.log(chalk.cyan(worktreeName.padEnd(18)) + ' ' + 
                   (info.branch || 'unknown').padEnd(14));
        
        if (ports) {
          for (const [service, port] of Object.entries(ports)) {
            const isRunning = runningPorts[service];
            const portStr = `${service}:${port}`;
            const status = isRunning ? chalk.green('✓') : ' ';
            console.log(' '.repeat(33) + portStr.padEnd(18) + status);
          }
        } else {
          console.log(' '.repeat(33) + chalk.gray('No ports assigned'));
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
      console.log(chalk.bold('\nWorktrees:'));
      for (const worktree of managedWorktrees) {
        const worktreeName = path.basename(worktree.path);
        const ports = portManager.getPorts(worktreeName);
        const portDisplay = ports ? portManager.formatPortDisplay(ports) : 'No ports';
        
        console.log(chalk.cyan(`  ${worktreeName}`) + 
                   chalk.gray(` (${worktree.branch || 'unknown'})`) +
                   chalk.gray(` - ${portDisplay}`));
      }
      console.log('\n' + chalk.gray('Use --verbose for detailed information'));
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

module.exports = { listCommand };