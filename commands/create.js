const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const PathUtils = require('../lib/pathUtils');
const { addCommandContext } = require('../lib/errorTranslator');
const Output = require('../lib/output');

async function createCommand(branchName, options) {
  const output = new Output({ verbose: options.verbose });
  
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
    
    // Concise output - combine creation messages
    if (!targetBranchExists && baseBranch) {
      const fromBranch = options.from ? baseBranch : `${mainBranch} (default)`;
      output.success('create', `created '${branchName}' from '${fromBranch}' at ${worktreePath}`);
    } else {
      output.success('create', `created worktree at ${worktreePath}`);
    }
    
    output.verboseStep('create', `worktree created at ${worktreePath}`);
    if (!targetBranchExists && baseBranch) {
      output.verboseStep('create', `created new branch '${branchName}' from '${baseBranch}'`);
    }
    
    await portManager.init(config.getBaseDir());
    
    const services = Object.keys(cfg.portRanges);
    const ports = await portManager.assignPorts(worktreeName, services, cfg.portRanges);
    
    // Show port assignments in verbose mode only
    output.verboseStep('create', `assigned ports: ${Object.entries(ports).map(([s, p]) => `${s}:${p}`).join(', ')}`);
    
    const envContent = Object.entries(ports)
      .map(([service, port]) => `${service.toUpperCase()}_PORT=${port}`)
      .concat([`WORKTREE_NAME=${worktreeName}`])
      .join(os.EOL) + os.EOL;
    
    const envPath = path.join(worktreePath, '.env.worktree');
    await fs.writeFile(envPath, envContent);
    output.verboseStep('create', 'created .env.worktree');
    
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
        output.verboseStep('create', 'added .env.worktree to .gitignore');
      }
    } catch (error) {
      output.verboseStep('create', 'warning: could not automatically add .env.worktree to .gitignore');
    }
    
    // Show next steps only in verbose mode
    if (options.verbose) {
      output.raw('\n' + 'To start working:');
      output.raw(chalk.gray(`  cd ${worktreePath}`));
      
      const packageJsonPath = path.join(worktreePath, 'package.json');
      try {
        await fs.access(packageJsonPath);
        const services = Object.keys(ports);
        if (services.includes('vite')) {
          output.raw(chalk.gray(`  npm run dev        # Runs on port ${ports.vite}`));
        }
        if (services.includes('storybook')) {
          output.raw(chalk.gray(`  npm run storybook  # Runs on port ${ports.storybook}`));
        }
      } catch {
        // package.json doesn't exist, skip usage instructions
      }
    }
    
  } catch (error) {
    output.error('create', error.message);
    const context = addCommandContext(error.message, 'create');
    if (context.tips && context.tips.length > 0 && options.verbose) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

module.exports = { createCommand };