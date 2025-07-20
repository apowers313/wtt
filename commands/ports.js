const chalk = require('chalk');
const inquirer = require('inquirer');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');

async function portsCommand(worktreeName) {
  try {
    await gitOps.validateRepository();
    await config.load();
    
    const cfg = config.get();
    await portManager.init(config.getBaseDir());
    
    if (worktreeName) {
      const ports = portManager.getPorts(worktreeName);
      
      if (!ports) {
        console.log(chalk.yellow(`No ports assigned to worktree '${worktreeName}'`));
        return;
      }
      
      console.log(chalk.blue(`\nPorts for worktree '${worktreeName}':`));
      
      for (const [service, port] of Object.entries(ports)) {
        const isInUse = await portManager.isPortInUse(port);
        const status = isInUse ? chalk.green(' (in use)') : chalk.gray(' (available)');
        console.log(chalk.gray(`  ${service}: ${port}${status}`));
      }
      
      const conflicts = [];
      for (const [service, port] of Object.entries(ports)) {
        if (await portManager.isPortInUse(port)) {
          const runningPorts = await portManager.getRunningPorts(worktreeName);
          if (!runningPorts[service]) {
            conflicts.push({ service, port });
          }
        }
      }
      
      if (conflicts.length > 0) {
        console.log('\n' + chalk.red('⚠ Port conflicts detected:'));
        for (const { service, port } of conflicts) {
          console.log(chalk.red(`  ${service} port ${port} is in use by another process`));
        }
        
        const { reassign } = await inquirer.prompt([{
          type: 'confirm',
          name: 'reassign',
          message: 'Would you like to reassign conflicting ports?',
          default: true
        }]);
        
        if (reassign) {
          const allPorts = portManager.getAllUsedPorts();
          for (const { service, port } of conflicts) {
            const range = cfg.portRanges[service];
            const newPort = portManager.findAvailablePort(range, allPorts);
            ports[service] = newPort;
            allPorts.push(newPort);
            console.log(chalk.green(`✓ Reassigned ${service} to port ${newPort}`));
          }
          
          portManager.portMap[worktreeName] = {
            ...ports,
            created: portManager.portMap[worktreeName].created
          };
          await portManager.save();
        }
      }
      
    } else {
      const allPorts = portManager.getAllPorts();
      
      if (Object.keys(allPorts).length === 0) {
        console.log(chalk.yellow('No port assignments found'));
        return;
      }
      
      console.log(chalk.blue('\nPort assignments for all worktrees:'));
      console.log(chalk.gray('─'.repeat(50)));
      
      for (const [worktreeName, ports] of Object.entries(allPorts)) {
        console.log('\n' + chalk.cyan(worktreeName));
        
        for (const [service, port] of Object.entries(ports)) {
          const isInUse = await portManager.isPortInUse(port);
          const status = isInUse ? chalk.green(' ✓') : '';
          console.log(chalk.gray(`  ${service}: ${port}${status}`));
        }
      }
      
      const usedPorts = portManager.getAllUsedPorts();
      console.log('\n' + chalk.gray(`Total ports in use: ${usedPorts.length}`));
      
      console.log('\n' + chalk.gray('Port ranges:'));
      for (const [service, range] of Object.entries(cfg.portRanges)) {
        console.log(chalk.gray(`  ${service}: ${range.start}-${range.start + 100} (increment: ${range.increment})`));
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

module.exports = { portsCommand };