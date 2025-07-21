const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');

async function switchCommand(worktreeName) {
  try {
    await gitOps.validateRepository();
    await config.load();
    
    await portManager.init(config.getBaseDir());
    
    const worktreePath = config.getWorktreePath(worktreeName);
    
    try {
      await fs.access(worktreePath);
    } catch {
      throw new Error(`Worktree '${worktreeName}' not found`);
    }
    
    console.log(chalk.blue(`Switching to worktree '${worktreeName}'...`));
    console.log(chalk.gray(`Path: ${worktreePath}`));
    
    const ports = portManager.getPorts(worktreeName);
    if (ports) {
      console.log('\n' + chalk.green('Assigned ports:'));
      for (const [service, port] of Object.entries(ports)) {
        const isRunning = await portManager.isPortInUse(port);
        const status = isRunning ? chalk.green(' (running)') : '';
        console.log(chalk.gray(`  ${service}: ${port}${status}`));
      }
    }
    
    const packageJsonPath = path.join(worktreePath, 'package.json');
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      if (packageJson.scripts) {
        console.log('\n' + chalk.green('Available npm scripts:'));
        for (const script of Object.keys(packageJson.scripts)) {
          console.log(chalk.gray(`  npm run ${script}`));
        }
      }
    } catch {
      // package.json doesn't exist or is invalid
    }
    
    console.log('\n' + chalk.cyan('To navigate to this worktree:'));
    console.log(chalk.gray(`  cd ${worktreePath}`));
    
    if (process.env.SHELL) {
      console.log('\n' + chalk.yellow('Note: This command cannot change your current directory.'));
      console.log(chalk.yellow('You need to manually run the cd command shown above.'));
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

module.exports = { switchCommand };