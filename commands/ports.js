const chalk = require('chalk');
const inquirer = require('inquirer');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const { addCommandContext } = require('../lib/errorTranslator');
const { getCurrentWorktree } = require('../lib/currentWorktree');

async function portsCommand(worktreeName) {
  try {
    await gitOps.validateRepository();
    await config.load();
    
    // Auto-detect current worktree if no name provided (but don't require it since this command can show all)
    if (!worktreeName) {
      worktreeName = await getCurrentWorktree();
      if (worktreeName) {
        console.log(chalk.gray(`Auto-detected current worktree: ${worktreeName}`));
      }
    }
    
    const cfg = config.get();
    await portManager.init(config.getBaseDir());
    
    if (worktreeName) {
      const ports = portManager.getPorts(worktreeName);
      
      if (!ports) {
        console.log(`No ports assigned to worktree '${worktreeName}'`);
        return;
      }
      
      console.log(`\nPorts for worktree '${worktreeName}':`);
      
      for (const [service, port] of Object.entries(ports)) {
        let status = '';
        try {
          const isInUse = await portManager.isPortInUse(port);
          status = isInUse ? ' (in use)' : ' (available)';
        } catch (error) {
          // Port checking might fail in some environments
          status = '';
        }
        console.log(`  ${service}: ${port}${status}`);
      }
      
      const conflicts = [];
      for (const [service, port] of Object.entries(ports)) {
        try {
          if (await portManager.isPortInUse(port)) {
            const runningPorts = await portManager.getRunningPorts(worktreeName);
            if (!runningPorts[service]) {
              conflicts.push({ service, port });
            }
          }
        } catch (error) {
          // Port checking might fail in some environments
          // Skip conflict detection for this port
        }
      }
      
      if (conflicts.length > 0) {
        console.log('\n⚠ Port conflicts detected:');
        for (const { service, port } of conflicts) {
          console.log(`  ${service} port ${port} is in use by another process`);
        }
        
        const { reassign } = await inquirer.prompt([{
          type: 'confirm',
          name: 'reassign',
          message: 'Would you like to reassign conflicting ports?',
          default: true
        }]);
        
        if (reassign && cfg.portRanges) {
          const allPorts = portManager.getAllUsedPorts();
          for (const { service } of conflicts) {
            const range = cfg.portRanges[service];
            if (range) {
              const newPort = portManager.findAvailablePort(range, allPorts);
              ports[service] = newPort;
              allPorts.push(newPort);
              console.log(`✓ Reassigned ${service} to port ${newPort}`);
            }
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
        console.log('No port assignments found');
        return;
      }
      
      console.log('\nPort assignments for all worktrees:');
      console.log('─'.repeat(50));
      
      for (const [worktreeName, ports] of Object.entries(allPorts)) {
        console.log('\n' + worktreeName);
        
        for (const [service, port] of Object.entries(ports)) {
          let status = '';
          try {
            const isInUse = await portManager.isPortInUse(port);
            status = isInUse ? ' ✓' : '';
          } catch (error) {
            // Port checking might fail in some environments (e.g., CI)
            // Just continue without the status indicator
          }
          console.log(`  ${service}: ${port}${status}`);
        }
      }
      
      const usedPorts = portManager.getAllUsedPorts();
      console.log('\n' + `Total ports in use: ${usedPorts.length}`);
      
      console.log('\n' + 'Port ranges:');
      if (cfg.portRanges) {
        for (const [service, range] of Object.entries(cfg.portRanges)) {
          console.log(`  ${service}: ${range.start}-${range.start + 100} (increment: ${range.increment})`);
        }
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    const context = addCommandContext(error.message, 'ports');
    if (context.tips && context.tips.length > 0) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

module.exports = { portsCommand };