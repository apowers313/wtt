const chalk = require('chalk');
const inquirer = require('inquirer');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const { addCommandContext } = require('../lib/errorTranslator');
const { getCurrentWorktree } = require('../lib/currentWorktree');
const Output = require('../lib/output');

async function portsCommand(worktreeName, options = {}) {
  const output = new Output({ verbose: options.verbose });
  
  try {
    await gitOps.validateRepository();
    await config.load();
    
    // Auto-detect current worktree if no name provided (but don't require it since this command can show all)
    if (!worktreeName) {
      worktreeName = await getCurrentWorktree();
      if (worktreeName) {
        output.verboseStep('ports', `auto-detected current worktree: ${worktreeName}`);
      }
    }
    
    const cfg = config.get();
    await portManager.init(config.getBaseDir());
    
    if (worktreeName) {
      const ports = portManager.getPorts(worktreeName);
      
      if (!ports) {
        output.success('ports', `no ports assigned to worktree '${worktreeName}'`);
        return;
      }
      
      // Show port summary in concise mode
      const portList = Object.entries(ports).map(([s, p]) => `${s}:${p}`).join(', ');
      output.success('ports', `${worktreeName}: ${portList}`);
      
      // Detailed view in verbose mode
      if (options.verbose) {
        output.raw(`\nPorts for worktree '${worktreeName}':`);
      
      for (const [service, port] of Object.entries(ports)) {
        let status = '';
        try {
          const isInUse = await portManager.isPortInUse(port);
          status = isInUse ? ' (in use)' : ' (available)';
        } catch (error) {
          // Port checking might fail in some environments
          status = '';
        }
        output.raw(`  ${service}: ${port}${status}`);
      }
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
        output.warning('ports', `${conflicts.length} port conflicts detected`);
        if (options.verbose) {
          for (const { service, port } of conflicts) {
            output.raw(`  ${service} port ${port} is in use by another process`);
          }
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
              output.success('ports', `reassigned ${service} to port ${newPort}`);
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
        output.success('ports', 'no port assignments found');
        return;
      }
      
      // Concise summary
      const totalWorktrees = Object.keys(allPorts).length;
      const totalPorts = portManager.getAllUsedPorts().length;
      output.success('ports', `${totalWorktrees} worktrees using ${totalPorts} ports`);
      
      // Detailed view in verbose mode
      if (options.verbose) {
        output.raw('\nPort assignments for all worktrees:');
        output.raw('─'.repeat(50));
        
        for (const [worktreeName, ports] of Object.entries(allPorts)) {
          output.raw('\n' + worktreeName);
          
          for (const [service, port] of Object.entries(ports)) {
            let status = '';
            try {
              const isInUse = await portManager.isPortInUse(port);
              status = isInUse ? ' ✓' : '';
            } catch (error) {
              // Port checking might fail in some environments (e.g., CI)
              // Just continue without the status indicator
            }
            output.raw(`  ${service}: ${port}${status}`);
          }
        }
      }
      
      if (options.verbose) {
        const usedPorts = portManager.getAllUsedPorts();
        output.raw('\n' + `Total ports in use: ${usedPorts.length}`);
        
        output.raw('\n' + 'Port ranges:');
        if (cfg.portRanges) {
          for (const [service, range] of Object.entries(cfg.portRanges)) {
            output.raw(`  ${service}: ${range.start}-${range.start + 100} (increment: ${range.increment})`);
          }
        }
      }
    }
    
  } catch (error) {
    output.error('ports', error.message);
    const context = addCommandContext(error.message, 'ports');
    if (context.tips && context.tips.length > 0 && options.verbose) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

module.exports = { portsCommand };