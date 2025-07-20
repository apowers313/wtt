const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const PathUtils = require('../lib/pathUtils');

async function createCommand(branchName, options) {
  try {
    await gitOps.validateRepository();
    await config.load();
    
    const cfg = config.get();
    const worktreeName = config.getWorktreeName(branchName);
    const worktreePath = config.getWorktreePath(worktreeName);
    
    console.log(chalk.blue(`Creating worktree '${worktreeName}'...`));
    
    const worktrees = await gitOps.listWorktrees();
    const existingWorktree = worktrees.find(wt => PathUtils.equals(wt.path, worktreePath));
    if (existingWorktree) {
      throw new Error(`Worktree already exists at ${worktreePath}`);
    }
    
    const baseBranch = options.from || null;
    if (baseBranch) {
      const branchExists = await gitOps.checkBranchExists(baseBranch);
      if (!branchExists) {
        throw new Error(`Base branch '${baseBranch}' does not exist`);
      }
    }
    
    await gitOps.createWorktree(worktreePath, branchName, baseBranch);
    console.log(chalk.green(`✓ Worktree created at ${worktreePath}`));
    
    await portManager.init(config.getBaseDir());
    
    const services = Object.keys(cfg.portRanges);
    const ports = await portManager.assignPorts(worktreeName, services, cfg.portRanges);
    
    console.log(chalk.green('✓ Assigned ports:'));
    for (const [service, port] of Object.entries(ports)) {
      console.log(chalk.gray(`  - ${service}: ${port}`));
    }
    
    const envContent = Object.entries(ports)
      .map(([service, port]) => `${service.toUpperCase()}_PORT=${port}`)
      .concat([`WORKTREE_NAME=${worktreeName}`])
      .join(os.EOL) + os.EOL;
    
    const envPath = path.join(worktreePath, '.env.worktree');
    await fs.writeFile(envPath, envContent);
    console.log(chalk.green('✓ Created .env.worktree'));
    
    // Ensure .env.worktree is ignored by git to prevent merge conflicts
    const gitignorePath = path.join(worktreePath, '.gitignore');
    try {
      let gitignoreContent = '';
      try {
        gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
      } catch {
        // .gitignore doesn't exist, we'll create it
      }
      
      if (!gitignoreContent.includes('.env.worktree')) {
        gitignoreContent += (gitignoreContent.endsWith('\n') || gitignoreContent.endsWith('\r\n')) ? '' : os.EOL;
        gitignoreContent += '.env.worktree' + os.EOL;
        await fs.writeFile(gitignorePath, gitignoreContent);
        console.log(chalk.green('✓ Added .env.worktree to .gitignore'));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠ Could not update .gitignore: ${error.message}`));
    }
    
    console.log('\n' + chalk.cyan('To start working:'));
    console.log(chalk.gray(`  cd ${worktreePath}`));
    
    const packageJsonPath = path.join(worktreePath, 'package.json');
    try {
      await fs.access(packageJsonPath);
      const services = Object.keys(ports);
      if (services.includes('vite')) {
        console.log(chalk.gray(`  npm run dev        # Runs on port ${ports.vite}`));
      }
      if (services.includes('storybook')) {
        console.log(chalk.gray(`  npm run storybook  # Runs on port ${ports.storybook}`));
      }
    } catch {
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

module.exports = { createCommand };