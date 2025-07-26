const chalk = require('chalk');

/**
 * Help topics system for WTT
 * Provides detailed guides for complex workflows and troubleshooting
 */
class HelpTopics {
  constructor() {
    this.topics = {
      'getting-started': this.getGettingStartedHelp(),
      'configuration': this.getConfigurationHelp(),
      'merge-conflicts': this.getMergeConflictsHelp(),
      'troubleshooting': this.getTroubleshootingHelp(),
      'development-workflow': this.getDevelopmentWorkflowHelp(),
      'port-management': this.getPortManagementHelp()
    };
  }

  /**
   * Show help for a specific topic
   */
  showTopic(topicName) {
    const topic = this.topics[topicName];
    if (!topic) {
      console.error(chalk.red(`Unknown help topic: ${topicName}`));
      console.log(chalk.gray('Available topics:'));
      this.listTopics();
      return false;
    }

    console.log(topic);
    return true;
  }

  /**
   * List all available topics
   */
  listTopics() {
    console.log(chalk.bold('Available help topics:\n'));
    
    const descriptions = {
      'getting-started': 'Quick start guide and basic workflow',
      'configuration': 'Configuration file options and port setup',
      'merge-conflicts': 'Handling and resolving merge conflicts',
      'troubleshooting': 'Common issues and solutions',
      'development-workflow': 'Best practices for parallel development',
      'port-management': 'Advanced port configuration and management'
    };

    Object.entries(descriptions).forEach(([topic, desc]) => {
      console.log(`  ${chalk.cyan(topic.padEnd(20))} ${desc}`);
    });

    console.log(chalk.gray('\nUse: wt help <topic> for detailed information'));
  }

  /**
   * Getting started guide
   */
  getGettingStartedHelp() {
    return `
${chalk.bold.blue('Getting Started with WTT')}

${chalk.bold('1. Initial Setup')}
   First, make sure you're in a git repository, then initialize WTT:
   
   ${chalk.cyan('$ cd your-project')}
   ${chalk.cyan('$ wt init')}
   
   This creates:
   • .worktree-config.json (configuration)
   • .worktrees/ directory (where worktrees live)
   • Updates .gitignore

${chalk.bold('2. Create Your First Worktree')}
   Create a worktree for a new feature:
   
   ${chalk.cyan('$ wt create feature-login')}
   
   This:
   • Creates .worktrees/wt-feature-login/ directory
   • Creates and checks out 'feature-login' branch
   • Assigns unique ports (vite:3001, storybook:6007, etc.)
   • Creates .env.worktree with port settings

${chalk.bold('3. Switch to Your Worktree')}
   Switch to the worktree with a custom shell:
   
   ${chalk.cyan('$ wt switch feature-login')}
   
   Your prompt changes to show the worktree:
   ${chalk.gray('[wt:feature-login] user@host ~/project/.worktrees/wt-feature-login $')}

${chalk.bold('4. Development Workflow')}
   Work normally in your worktree:
   
   ${chalk.cyan('$ npm run dev      # Uses assigned port automatically')}
   ${chalk.cyan('$ git add .')}
   ${chalk.cyan('$ git commit -m "Add login form"')}

${chalk.bold('5. Merge When Ready')}
   Merge your feature back to main:
   
   ${chalk.cyan('$ wt merge feature-login --delete')}
   
   This merges the branch and cleans up the worktree.

${chalk.bold('6. List and Manage Worktrees')}
   See all your worktrees:
   
   ${chalk.cyan('$ wt list              # Simple list')}
   ${chalk.cyan('$ wt list --verbose    # Detailed table')}

${chalk.bold('Common Commands Summary:')}
   ${chalk.cyan('wt init')}                  Initialize WTT in repository
   ${chalk.cyan('wt create <branch>')}       Create new worktree
   ${chalk.cyan('wt list')}                  List all worktrees
   ${chalk.cyan('wt switch <name>')}         Switch to worktree shell
   ${chalk.cyan('wt merge <name>')}          Merge and optionally cleanup
   ${chalk.cyan('wt remove <name>')}         Remove worktree
   ${chalk.cyan('wt ports')}                 Show port assignments

${chalk.bold('Next Steps:')}
   • Try: ${chalk.cyan('wt help development-workflow')} for advanced usage
   • Try: ${chalk.cyan('wt help merge-conflicts')} for handling conflicts
   • Try: ${chalk.cyan('wt create --help')} for command-specific help
`;
  }

  /**
   * Configuration help
   */
  getConfigurationHelp() {
    return `
${chalk.bold.blue('WTT Configuration Guide')}

${chalk.bold('Configuration File (.worktree-config.json)')}
   Created by ${chalk.cyan('wt init')}, this file controls WTT behavior:

   ${chalk.gray('{')}
   ${chalk.gray('  "worktreeDir": ".worktrees",')}
   ${chalk.gray('  "mainBranch": "main",')}
   ${chalk.gray('  "autoCleanup": false,')}
   ${chalk.gray('  "ports": {')}
   ${chalk.gray('    "vite": { "start": 3000, "end": 3099 },')}
   ${chalk.gray('    "storybook": { "start": 6006, "end": 6106 },')}
   ${chalk.gray('    "custom": { "start": 8080, "end": 8179 }')}
   ${chalk.gray('  }')}
   ${chalk.gray('}')}

${chalk.bold('Configuration Options:')}

   ${chalk.cyan('worktreeDir')}        Directory for all worktrees (default: .worktrees)
   ${chalk.cyan('mainBranch')}         Main branch name (default: main)  
   ${chalk.cyan('autoCleanup')}        Auto-delete worktrees after merge (default: false)

${chalk.bold('Port Configuration:')}
   Each service gets a range of ports. WTT assigns the first available port
   in each range to new worktrees.

   ${chalk.cyan('vite')}               React/Vue development server ports
   ${chalk.cyan('storybook')}          Storybook component library ports
   ${chalk.cyan('custom')}             Custom development server ports

${chalk.bold('Adding Custom Port Ranges:')}
   You can add your own services:

   ${chalk.gray('"ports": {')}
   ${chalk.gray('  "vite": { "start": 3000, "end": 3099 },')}
   ${chalk.gray('  "api-server": { "start": 4000, "end": 4099 },')}
   ${chalk.gray('  "database": { "start": 5432, "end": 5532 }')}
   ${chalk.gray('}')}

${chalk.bold('Environment Variables:')}
   Each worktree gets a .env.worktree file with assigned ports:

   ${chalk.gray('VITE_PORT=3001')}
   ${chalk.gray('STORYBOOK_PORT=6007')} 
   ${chalk.gray('CUSTOM_PORT=8081')}
   ${chalk.gray('API_SERVER_PORT=4001')}

${chalk.bold('Using Ports in Development:')}
   ${chalk.cyan('# In package.json scripts:')}
   ${chalk.gray('"dev": "vite --port $VITE_PORT"')}
   ${chalk.gray('"storybook": "start-storybook -p $STORYBOOK_PORT"')}

   ${chalk.cyan('# In application code:')}
   ${chalk.gray('const port = process.env.VITE_PORT || 3000;')}

${chalk.bold('Port Management Commands:')}
   ${chalk.cyan('wt ports')}                   Show all port assignments
   ${chalk.cyan('wt ports <worktree>')}        Show ports for specific worktree
   ${chalk.cyan('wt ports --release <name>')}  Release ports manually

${chalk.bold('Troubleshooting Configuration:')}
   • Config not found: Run ${chalk.cyan('wt init')} in repository root
   • Port conflicts: Check ${chalk.cyan('wt ports')} and adjust ranges
   • Permission issues: Ensure write access to repository directory
`;
  }

  /**
   * Merge conflicts help
   */
  getMergeConflictsHelp() {
    return `
${chalk.bold.blue('Handling Merge Conflicts in WTT')}

${chalk.bold('Understanding Conflicts')}
   Conflicts occur when the same lines in files are changed differently
   in your feature branch and the main branch.

${chalk.bold('Prevention')}
   ${chalk.cyan('$ wt merge --check feature-branch')}    Preview conflicts before merging
   
   This shows potential conflicts without actually merging.

${chalk.bold('When Conflicts Occur')}
   If ${chalk.cyan('wt merge')} reports conflicts:
   
   ${chalk.red('wt merge: error: conflicts in 2 files (run \'git status\' for details)')}
   
   WTT automatically creates a backup before merge attempts.

${chalk.bold('Manual Resolution Process')}
   1. Check which files have conflicts:
      ${chalk.cyan('$ git status')}
   
   2. Edit conflicted files. Look for conflict markers:
      ${chalk.gray('<<<<<<< HEAD')}
      ${chalk.gray('Content from main branch')}
      ${chalk.gray('=======')}
      ${chalk.gray('Content from your feature branch')}
      ${chalk.gray('>>>>>>> feature-branch')}
   
   3. Remove markers and keep the desired content:
      ${chalk.gray('Combined content from both branches')}
   
   4. Stage the resolved files:
      ${chalk.cyan('$ git add resolved-file.js')}
   
   5. Complete the merge:
      ${chalk.cyan('$ git commit')}

${chalk.bold('WTT Conflict Helpers')}
   WTT provides commands to help with conflicts:
   
   ${chalk.cyan('wt conflicts list')}           Show all current conflicts
   ${chalk.cyan('wt conflicts fix')}            Interactive conflict resolution
   ${chalk.cyan('wt conflicts fix --tool vscode')}  Use external merge tool
   ${chalk.cyan('wt conflicts accept ours')}    Accept all changes from main
   ${chalk.cyan('wt conflicts accept theirs')}  Accept all changes from feature

${chalk.bold('Automatic Whitespace Resolution')}
   For conflicts that are only whitespace differences:
   
   ${chalk.cyan('wt conflicts fix --auto-whitespace')}
   
   This automatically resolves whitespace-only conflicts.

${chalk.bold('Aborting a Merge')}
   If you want to cancel the merge:
   
   ${chalk.cyan('wt merge --abort')}
   
   This returns to the state before the merge and restores from backup.

${chalk.bold('Recovery from Failed Merge')}
   If something goes wrong during conflict resolution:
   
   ${chalk.cyan('wt restore --last-backup')}    Restore from most recent backup
   ${chalk.cyan('wt panic')}                    Emergency recovery help

${chalk.bold('Best Practices')}
   • Use ${chalk.cyan('wt merge --check')} to preview conflicts
   • Keep feature branches small and up-to-date with main
   • Resolve conflicts in small chunks rather than all at once
   • Test your code after resolving conflicts
   • Use ${chalk.cyan('wt conflicts predict')} to check for potential issues

${chalk.bold('Common Conflict Scenarios')}
   
   ${chalk.yellow('Package.json conflicts:')}
   Often caused by different dependencies. Merge both sets of changes.
   
   ${chalk.yellow('Import statement conflicts:')}
   Usually safe to include both imports unless they conflict.
   
   ${chalk.yellow('Configuration file conflicts:')}
   Carefully review - may need manual integration of settings.

${chalk.bold('External Merge Tools')}
   You can use external tools for complex conflicts:
   
   ${chalk.cyan('wt conflicts fix --tool vscode')}     Visual Studio Code
   ${chalk.cyan('wt conflicts fix --tool vim')}        Vim merge mode  
   ${chalk.cyan('wt conflicts fix --tool meld')}       Meld visual diff tool
`;
  }

  /**
   * Troubleshooting help
   */
  getTroubleshootingHelp() {
    return `
${chalk.bold.blue('WTT Troubleshooting Guide')}

${chalk.bold('Common Issues and Solutions')}

${chalk.yellow('❌ "Not in a git repository"')}
   ${chalk.bold('Cause:')} Running WTT outside a git repository
   ${chalk.bold('Solution:')} 
   • ${chalk.cyan('cd')} to your git repository directory
   • Or run ${chalk.cyan('git init')} to create a new repository

${chalk.yellow('❌ "No worktree configuration found"')}
   ${chalk.bold('Cause:')} WTT not initialized in this repository
   ${chalk.bold('Solution:')} Run ${chalk.cyan('wt init')} in the repository root

${chalk.yellow('❌ "Worktree already exists"')}
   ${chalk.bold('Cause:')} Trying to create a worktree that already exists
   ${chalk.bold('Solutions:')}
   • Use ${chalk.cyan('wt switch existing-name')} to work in existing worktree
   • Use ${chalk.cyan('wt remove existing-name')} to delete it first
   • Choose a different name for your new worktree

${chalk.yellow('❌ "Uncommitted changes in repository"')}
   ${chalk.bold('Cause:')} Trying to merge/switch with unsaved work
   ${chalk.bold('Solutions:')}
   • ${chalk.cyan('git add . && git commit -m "Save work"')} to commit changes
   • ${chalk.cyan('wt save-work')} to temporarily stash changes
   • Use ${chalk.cyan('--force')} flag to override (may lose changes)

${chalk.yellow('❌ "Conflicts in X files"')}
   ${chalk.bold('Cause:')} Merge conflicts between branches
   ${chalk.bold('Solution:')} See ${chalk.cyan('wt help merge-conflicts')} for detailed guide

${chalk.yellow('❌ "Port already in use"')}
   ${chalk.bold('Cause:')} Another process is using assigned ports
   ${chalk.bold('Solutions:')}
   • Kill process using the port: ${chalk.cyan('lsof -ti:3001 | xargs kill')}
   • Reassign ports: ${chalk.cyan('wt ports --assign worktree-name')}
   • Check port assignments: ${chalk.cyan('wt ports')}

${chalk.yellow('❌ "Permission denied"')}
   ${chalk.bold('Cause:')} Insufficient file system permissions
   ${chalk.bold('Solutions:')}
   • Check directory permissions: ${chalk.cyan('ls -la .worktrees/')}
   • Ensure you own the repository directory
   • On shared systems, check group permissions

${chalk.bold('Performance Issues')}

${chalk.yellow('⚠️  Slow worktree creation')}
   ${chalk.bold('Causes:')} Large repository, slow disk, network issues
   ${chalk.bold('Solutions:')}
   • Use ${chalk.cyan('--verbose')} to see where time is spent
   • Check disk space: ${chalk.cyan('df -h')}
   • For large repos, consider sparse-checkout

${chalk.yellow('⚠️  Many worktrees slow down git operations')}
   ${chalk.bold('Solution:')} Clean up unused worktrees regularly with ${chalk.cyan('wt remove')}

${chalk.bold('Recovery Commands')}

${chalk.cyan('wt panic')}                    Emergency help for when things go wrong
${chalk.cyan('wt restore --last-backup')}   Restore from most recent backup
${chalk.cyan('wt recovery find-commits')}   Find lost commits
${chalk.cyan('wt recovery restore <hash>')} Restore specific commit

${chalk.bold('Diagnostic Commands')}

${chalk.cyan('wt list --verbose')}          Show detailed worktree status
${chalk.cyan('wt ports')}                   Check port assignments
${chalk.cyan('git worktree list')}          Show git's view of worktrees
${chalk.cyan('git status')}                 Check repository state

${chalk.bold('Environment Issues')}

${chalk.yellow('❌ Shell doesn\'t show worktree prompt')}
   ${chalk.bold('Cause:')} Shell doesn't support custom prompts
   ${chalk.bold('Solutions:')}
   • Use ${chalk.cyan('wt switch --no-shell')} to just change directory
   • Check if $WT_WORKTREE environment variable is set
   • Verify shell compatibility (bash, zsh, fish supported)

${chalk.yellow('❌ Environment variables not loaded')}
   ${chalk.bold('Cause:')} .env.worktree not sourced properly
   ${chalk.bold('Solutions:')}
   • Check if .env.worktree exists in worktree directory
   • Manually source: ${chalk.cyan('source .env.worktree')}
   • Use ${chalk.cyan('wt ports --assign')} to recreate

${chalk.bold('Getting Help')}

When reporting issues:
1. Include output of ${chalk.cyan('wt list --verbose')}
2. Include WTT version: ${chalk.cyan('wt --version')}
3. Include git version: ${chalk.cyan('git --version')}
4. Include operating system information
5. Include exact error message and steps to reproduce

${chalk.bold('Emergency Recovery')}
If WTT is completely broken:
1. ${chalk.cyan('wt panic')} - Shows emergency recovery options
2. Manual cleanup: Remove .worktrees/ directory and start over
3. Git recovery: Use ${chalk.cyan('git worktree list')} and ${chalk.cyan('git worktree remove')}
`;
  }

  /**
   * Development workflow help
   */
  getDevelopmentWorkflowHelp() {
    return `
${chalk.bold.blue('WTT Development Workflow Best Practices')}

${chalk.bold('Recommended Workflow')}

${chalk.bold('1. Feature Development')}
   ${chalk.cyan('$ wt create feature-user-auth')}       Create dedicated worktree
   ${chalk.cyan('$ wt switch feature-user-auth')}       Switch to worktree shell
   ${chalk.cyan('$ npm run dev')}                       Start development server
   
   • Work in isolation with dedicated ports
   • Commit frequently with descriptive messages
   • Keep feature scope small and focused

${chalk.bold('2. Parallel Development')}
   ${chalk.cyan('$ wt create feature-dashboard')}       Second feature
   ${chalk.cyan('$ wt create hotfix-security')}         Urgent fix in parallel
   
   • Each worktree has independent development environment
   • No conflicts between different features
   • Test features independently

${chalk.bold('3. Integration and Testing')}
   ${chalk.cyan('$ wt merge --check feature-user-auth')} Preview merge conflicts
   ${chalk.cyan('$ wt merge feature-user-auth')}         Merge when ready
   ${chalk.cyan('$ wt switch main')}                     Test integration
   
   • Always preview merges first
   • Test in main branch after merging
   • Keep main branch stable

${chalk.bold('Advanced Workflows')}

${chalk.bold('Long-running Feature Branches')}
   For complex features that take weeks:
   
   ${chalk.cyan('$ wt create epic-redesign --from main')}
   ${chalk.gray('# Work for several days')}
   ${chalk.cyan('$ git fetch origin')}
   ${chalk.cyan('$ git merge origin/main')}              Keep up-to-date with main
   ${chalk.gray('# Continue development')}
   ${chalk.cyan('$ wt merge epic-redesign')}             Final merge

${chalk.bold('Hotfix Workflow')}
   For urgent production fixes:
   
   ${chalk.cyan('$ wt create hotfix-critical --from production')}
   ${chalk.cyan('$ wt switch hotfix-critical')}
   ${chalk.gray('# Make minimal fix')}
   ${chalk.cyan('$ wt merge hotfix-critical')}
   ${chalk.cyan('$ git push origin main')}               Deploy immediately

${chalk.bold('Experimental Features')}
   For trying new ideas:
   
   ${chalk.cyan('$ wt create experiment-new-ui')}
   ${chalk.gray('# Experiment freely')}
   ${chalk.cyan('$ wt remove experiment-new-ui')}        Clean up if not needed
   
   • No fear of breaking main branch
   • Easy to discard experiments
   • Can create multiple experiments

${chalk.bold('Team Collaboration')}

${chalk.bold('Branch Naming Conventions')}
   • ${chalk.cyan('feature/user-auth')}        New features
   • ${chalk.cyan('bugfix/login-error')}       Bug fixes  
   • ${chalk.cyan('hotfix/security-patch')}    Urgent fixes
   • ${chalk.cyan('experiment/new-design')}    Experimental work

${chalk.bold('Port Coordination')}
   When working in teams:
   • Document port ranges in README
   • Use consistent naming conventions
   • Share .worktree-config.json in repository

${chalk.bold('Code Review Workflow')}
   ${chalk.cyan('$ wt create review-pr-123')}           Create worktree for review
   ${chalk.cyan('$ git fetch origin pull/123/head:pr-123')}
   ${chalk.cyan('$ git checkout pr-123')}               Check out PR branch
   ${chalk.gray('# Review and test')}
   ${chalk.cyan('$ wt remove review-pr-123')}           Clean up after review

${chalk.bold('Performance Optimization')}

${chalk.bold('Worktree Management')}
   • Keep only 3-5 active worktrees
   • Remove completed features promptly: ${chalk.cyan('wt remove old-feature')}
   • Use ${chalk.cyan('wt list')} to track active worktrees

${chalk.bold('Git Performance')}
   • Run ${chalk.cyan('git gc')} periodically to clean up
   • Use ${chalk.cyan('git worktree prune')} to clean orphaned worktrees
   • Consider sparse-checkout for very large repositories

${chalk.bold('Development Server Management')}
   • Use assigned ports consistently
   • Stop servers when switching worktrees
   • Monitor port usage: ${chalk.cyan('wt ports')}

${chalk.bold('Integration with IDEs')}

${chalk.bold('VS Code')}
   • Open worktree folder directly: ${chalk.cyan('code .worktrees/wt-feature')}
   • Use workspace files for multi-root setup
   • Configure tasks.json to use environment variables

${chalk.bold('JetBrains IDEs')}
   • Open project at worktree level
   • Configure run configurations with port variables
   • Use project-specific settings

${chalk.bold('Vim/Neovim')}
   • Use session management for worktree contexts
   • Configure LSP per worktree
   • Use tmux for terminal management

${chalk.bold('Troubleshooting Workflow Issues')}
   • Stuck in merge: ${chalk.cyan('wt merge --abort')}
   • Lost changes: ${chalk.cyan('wt recovery find-commits')}
   • Port conflicts: ${chalk.cyan('wt ports --assign')}
   • General issues: ${chalk.cyan('wt panic')} for emergency help
`;
  }

  /**
   * Port management help
   */
  getPortManagementHelp() {
    return `
${chalk.bold.blue('Advanced Port Management in WTT')}

${chalk.bold('How Port Assignment Works')}
   WTT automatically assigns unique ports to each worktree from
   configured ranges. This prevents conflicts when running multiple
   development servers simultaneously.

${chalk.bold('Default Port Ranges')}
   ${chalk.cyan('vite:')}        3000-3099  (React/Vue development servers)
   ${chalk.cyan('storybook:')}   6006-6106  (Component library development)
   ${chalk.cyan('custom:')}      8080-8179  (Custom development servers)

${chalk.bold('Port Assignment Process')}
   1. When creating a worktree: ${chalk.cyan('wt create feature-auth')}
   2. WTT finds the first available port in each range
   3. Creates .env.worktree with assigned ports:
      ${chalk.gray('VITE_PORT=3001')}
      ${chalk.gray('STORYBOOK_PORT=6007')}
      ${chalk.gray('CUSTOM_PORT=8081')}

${chalk.bold('Viewing Port Assignments')}
   ${chalk.cyan('wt ports')}                    Show all port assignments
   ${chalk.cyan('wt ports feature-auth')}       Show ports for specific worktree
   ${chalk.cyan('wt ports --verbose')}          Detailed port information

${chalk.bold('Manual Port Management')}
   ${chalk.cyan('wt ports --assign worktree')}   Assign new ports to worktree
   ${chalk.cyan('wt ports --release worktree')}  Release ports from worktree
   
   Useful when:
   • Ports become unavailable due to crashed processes
   • Need to reassign ports after configuration changes
   • Resolving port conflicts

${chalk.bold('Custom Port Configuration')}
   Edit .worktree-config.json to add custom services:

   ${chalk.gray('{')}
   ${chalk.gray('  "ports": {')}
   ${chalk.gray('    "vite": { "start": 3000, "end": 3099 },')}
   ${chalk.gray('    "storybook": { "start": 6006, "end": 6106 },')}
   ${chalk.gray('    "api": { "start": 4000, "end": 4099 },')}
   ${chalk.gray('    "database": { "start": 5432, "end": 5532 },')}
   ${chalk.gray('    "redis": { "start": 6379, "end": 6479 }')}
   ${chalk.gray('  }')}
   ${chalk.gray('}')}

${chalk.bold('Using Ports in Applications')}

${chalk.bold('Package.json Scripts')}
   ${chalk.gray('"scripts": {')}
   ${chalk.gray('  "dev": "vite --port $VITE_PORT --host",')}
   ${chalk.gray('  "storybook": "start-storybook -p $STORYBOOK_PORT",')}
   ${chalk.gray('  "api": "node server.js --port $API_PORT"')}
   ${chalk.gray('}')}

${chalk.bold('Application Code')}
   ${chalk.gray('// React/Vite')}
   ${chalk.gray('const port = process.env.VITE_PORT || 3000;')}
   
   ${chalk.gray('// Node.js API')}
   ${chalk.gray('const port = process.env.API_PORT || 4000;')}
   ${chalk.gray('app.listen(port, () => {')}
   ${chalk.gray('  console.log(`Server running on port ${port}`);')}
   ${chalk.gray('});')}

${chalk.bold('Docker Integration')}
   Use environment variables in docker-compose.yml:
   
   ${chalk.gray('services:')}
   ${chalk.gray('  app:')}
   ${chalk.gray('    ports:')}
   ${chalk.gray('      - "${VITE_PORT}:3000"')}
   ${chalk.gray('  api:')}
   ${chalk.gray('    ports:')}
   ${chalk.gray('      - "${API_PORT}:4000"')}

${chalk.bold('Port Conflict Resolution')}

${chalk.bold('Finding Port Conflicts')}
   ${chalk.cyan('lsof -ti:3001')}               Check what's using port 3001
   ${chalk.cyan('netstat -tulpn | grep 3001')}  Alternative port check
   ${chalk.cyan('wt ports --check')}            Check all assigned ports

${chalk.bold('Resolving Conflicts')}
   1. Kill process using the port:
      ${chalk.cyan('lsof -ti:3001 | xargs kill')}
   
   2. Or reassign ports:
      ${chalk.cyan('wt ports --assign worktree-name')}
   
   3. Or expand port ranges in configuration

${chalk.bold('Port Range Planning')}

${chalk.bold('Small Team (1-5 developers)')}
   • Default ranges are usually sufficient
   • 100 ports per service allows 20+ worktrees per developer

${chalk.bold('Large Team (5+ developers)')}
   Consider expanding ranges:
   ${chalk.gray('{')}
   ${chalk.gray('  "vite": { "start": 3000, "end": 3999 },')}
   ${chalk.gray('  "storybook": { "start": 6000, "end": 6999 }')}
   ${chalk.gray('}')}

${chalk.bold('CI/CD Integration')}
   For testing in CI environments:
   ${chalk.gray('# Use random ports to avoid conflicts')}
   ${chalk.gray('export VITE_PORT=$(shuf -i 3000-3999 -n 1)')}
   ${chalk.gray('export API_PORT=$(shuf -i 4000-4999 -n 1)')}

${chalk.bold('Monitoring and Debugging')}

${chalk.bold('Port Usage Statistics')}
   ${chalk.cyan('wt ports --stats')}             Show port usage statistics
   ${chalk.cyan('wt ports --unused')}            Show unused ports in ranges
   ${chalk.cyan('wt ports --conflicts')}         Check for port conflicts

${chalk.bold('Debugging Port Issues')}
   1. Check port assignments: ${chalk.cyan('wt ports')}
   2. Verify .env.worktree exists and is correct
   3. Check if ports are actually free: ${chalk.cyan('lsof -i :3001')}
   4. Restart development servers after port changes
   5. Clear browser cache if accessing wrong ports

${chalk.bold('Best Practices')}
   • Don't hardcode ports in development
   • Always use environment variables
   • Document custom port ranges in README
   • Monitor port usage regularly
   • Clean up unused worktrees to free ports
   • Use consistent port naming conventions
`;
  }
}

module.exports = HelpTopics;