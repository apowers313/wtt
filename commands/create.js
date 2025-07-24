const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const PathUtils = require('../lib/pathUtils');
const { addCommandContext } = require('../lib/errorTranslator');

async function createCommand(branchName, options) {
  try {
    await gitOps.validateRepository();
    await config.load();
    
    const cfg = config.get();
    const worktreeName = config.getWorktreeName(branchName);
    const worktreePath = config.getWorktreePath(worktreeName);
    
    
    const worktrees = await gitOps.listWorktrees();
    const existingWorktree = worktrees.find(wt => PathUtils.equals(wt.path, worktreePath));
    if (existingWorktree) {
      throw new Error(`A worktree already exists at ${worktreePath}. Use 'wt switch ${worktreeName}' to work in it, or 'wt remove ${worktreeName}' to delete it first`);
    }
    
    const mainBranch = await gitOps.getMainBranch(cfg);
    const baseBranch = options.from || mainBranch;
    const targetBranchExists = await gitOps.checkBranchExists(branchName);
    
    // Check if the base branch exists
    const branchExists = await gitOps.checkBranchExists(baseBranch);
    if (!branchExists) {
      throw new Error(`The branch '${baseBranch}' doesn't exist. Use 'git branch' to see available branches, or specify a different branch with --from`);
    }
    
    await gitOps.createWorktree(worktreePath, branchName, baseBranch, mainBranch);
    console.log(`✓ Worktree created at ${worktreePath}`);
    
    // Only show "created from" message when we're actually creating a new branch
    if (!targetBranchExists && baseBranch) {
      if (!options.from) {
        console.log(`✓ Created new branch '${branchName}' from '${mainBranch}' (default)`);
      } else {
        console.log(`✓ Created new branch '${branchName}' from '${baseBranch}'`);
      }
    }
    
    await portManager.init(config.getBaseDir());
    
    const services = Object.keys(cfg.portRanges);
    const ports = await portManager.assignPorts(worktreeName, services, cfg.portRanges);
    
    console.log('✓ Assigned ports:');
    for (const [service, port] of Object.entries(ports)) {
      console.log(`  - ${service}: ${port}`);
    }
    
    const envContent = Object.entries(ports)
      .map(([service, port]) => `${service.toUpperCase()}_PORT=${port}`)
      .concat([`WORKTREE_NAME=${worktreeName}`])
      .join(os.EOL) + os.EOL;
    
    const envPath = path.join(worktreePath, '.env.worktree');
    await fs.writeFile(envPath, envContent);
    console.log('✓ Created .env.worktree');
    
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
        console.log('✓ Added .env.worktree to .gitignore');
      }
    } catch (error) {
      console.log(chalk.yellow('⚠ Could not automatically add .env.worktree to .gitignore'));
    }
    
    
    console.log('\n' + 'To start working:');
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
      // package.json doesn't exist, skip usage instructions
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    const context = addCommandContext(error.message, 'create');
    if (context.tips && context.tips.length > 0) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

module.exports = { createCommand };