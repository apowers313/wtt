const chalk = require('chalk');
const path = require('path');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const PathUtils = require('../lib/pathUtils');

async function listCommand(options) {
  try {
    console.log('[DEBUG] list command - Starting');
    console.log('[DEBUG] list command - Platform:', process.platform);
    console.log('[DEBUG] list command - CWD:', process.cwd());
    
    await gitOps.validateRepository();
    await config.load();
    
    const cfg = config.get();
    console.log('[DEBUG] list command - Config baseDir:', cfg.baseDir);
    console.log('[DEBUG] list command - Config contents:', JSON.stringify(cfg, null, 2));
    
    await portManager.init(config.getBaseDir());
    
    const worktrees = await gitOps.listWorktrees();
    console.log('[DEBUG] list command - Raw worktrees from git:', JSON.stringify(worktrees, null, 2));
    console.log('[DEBUG] list command - Number of worktrees found:', worktrees.length);
    
    const managedWorktrees = worktrees.filter((wt, index) => {
      console.log(`[DEBUG] list command - Filtering worktree ${index}:`, wt);
      
      // Normalize paths for cross-platform comparison using PathUtils
      const normalizedPath = PathUtils.normalize(wt.path);
      const normalizedBaseDir = PathUtils.normalize(cfg.baseDir);
      const normalizedCwd = PathUtils.normalize(process.cwd());
      
      console.log(`[DEBUG] list command - Worktree ${index} paths:`);
      console.log('  Original path:', wt.path);
      console.log('  Normalized path:', normalizedPath);
      console.log('  Normalized baseDir:', normalizedBaseDir);
      console.log('  Normalized cwd:', normalizedCwd);
      
      // Use PathUtils.equals for the CWD comparison to handle Windows paths properly
      // Also check if the path is under the baseDir using a more robust comparison
      const isUnderBaseDir = normalizedPath.startsWith(normalizedBaseDir) || 
                            normalizedPath.includes(normalizedBaseDir);
      const isNotCwd = !PathUtils.equals(normalizedPath, normalizedCwd);
      
      console.log(`[DEBUG] list command - Worktree ${index} filter results:`);
      console.log('  isUnderBaseDir:', isUnderBaseDir);
      console.log('    startsWith:', normalizedPath.startsWith(normalizedBaseDir));
      console.log('    includes:', normalizedPath.includes(normalizedBaseDir));
      console.log('  isNotCwd:', isNotCwd);
      console.log('  Final result:', isUnderBaseDir && isNotCwd);
      
      return isUnderBaseDir && isNotCwd;
    });
    
    console.log('[DEBUG] list command - Filtered worktrees count:', managedWorktrees.length);
    console.log('[DEBUG] list command - Filtered worktrees:', JSON.stringify(managedWorktrees, null, 2));
    
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