const chalk = require('chalk');
const inquirer = require('inquirer');

class HelpSystem {
  constructor() {
    this.topics = {
      'merge-conflicts': {
        title: 'Understanding Merge Conflicts',
        content: `
${chalk.bold('🤔 What are merge conflicts?')}

Merge conflicts happen when two branches change the same code differently.
Git can't automatically decide which change to keep, so it asks you to choose.

${chalk.bold('Why do they happen?')}
• Two people edited the same line of code
• One person deleted a file, another modified it
• Formatting changes conflict with code changes

${chalk.bold('Common solutions:')}
1. Pick one version (yours or theirs)
2. Combine both changes
3. Write something new that incorporates both ideas

${chalk.bold('Prevention tips:')}
• Sync with main branch regularly (daily is good)
• Communicate with team about who's working on what
• Keep changes small and focused
• Use consistent formatting rules`,
        relatedCommands: ['wt conflicts fix', 'wt merge --check', 'wt conflicts predict']
      },
      
      'lost-work': {
        title: 'Recovering Lost Work',
        content: `
${chalk.bold('🔍 Don\'t panic - Git rarely loses work!')}

Git keeps a history of everything for at least 30 days, even if you think it's gone.

${chalk.bold('Where to look for lost work:')}
1. ${chalk.cyan('Git reflog')} - Shows all recent actions
2. ${chalk.cyan('Stashes')} - Temporary work storage
3. ${chalk.cyan('Automatic backups')} - Created before risky operations
4. ${chalk.cyan('Other branches')} - Work might be on a different branch

${chalk.bold('Recovery steps:')}
1. Run 'wt recovery find-commits' to see recent work
2. Look for your commit by message or date
3. Use 'wt recovery restore <commit>' to get it back

${chalk.bold('Prevention:')}
• Commit often (even small changes)
• Use descriptive commit messages
• Push to remote regularly`,
        relatedCommands: ['wt recovery find-commits', 'wt recovery restore', 'wt backup list']
      },
      
      'conflict-resolution': {
        title: 'Step-by-Step Conflict Resolution',
        content: `
${chalk.bold('📝 Resolving conflicts step by step:')}

${chalk.cyan('1. Understand the conflict')}
   Look at both versions and understand what each is trying to do

${chalk.cyan('2. Decide on a strategy')}
   • Keep one version if it's clearly better
   • Combine both if they do different things
   • Write new code if neither is quite right

${chalk.cyan('3. Test your resolution')}
   After resolving, make sure the code still works

${chalk.cyan('4. Stage and continue')}
   Mark the file as resolved and continue the merge

${chalk.bold('Pro tips:')}
• Take your time - rushing leads to bugs
• Ask the other developer if unsure
• Use 'wt conflicts fix --tool=vscode' for visual editing
• Create a backup first with 'wt backup create'`,
        relatedCommands: ['wt conflicts fix', 'wt conflicts list', 'wt backup create']
      },
      
      'merge-strategy': {
        title: 'Choosing a Merge Strategy',
        content: `
${chalk.bold('🎯 Different ways to merge:')}

${chalk.cyan('Regular merge (default)')}
• Preserves all commit history
• Shows who did what and when
• Best for: feature branches, team collaboration

${chalk.cyan('Squash merge')}
• Combines all commits into one
• Cleaner history
• Best for: small fixes, experiments

${chalk.cyan('Rebase')}
• Moves your commits on top of target branch
• Linear history
• Best for: personal branches (never rebase shared branches!)

${chalk.bold('Which to choose?')}
• Use regular merge for most cases
• Use squash for tiny changes
• Only rebase if you know what you're doing`,
        relatedCommands: ['wt merge', 'git merge --squash', 'git rebase']
      },
      
      'backup-restore': {
        title: 'Using Backups',
        content: `
${chalk.bold('🔒 Automatic backup system:')}

wtt automatically creates backups before risky operations like merges.

${chalk.bold('What gets backed up?')}
• Current branch state
• All uncommitted changes
• Stashes
• Branch references

${chalk.bold('Using backups:')}
${chalk.cyan('List backups:')} wt backup list
${chalk.cyan('Restore:')} wt backup restore <backup-id>
${chalk.cyan('Clean old:')} wt backup clean --older-than 7d

${chalk.bold('Manual backups:')}
Create your own backup anytime:
  wt backup create "Before big refactor"`,
        relatedCommands: ['wt backup list', 'wt backup restore', 'wt backup create']
      }
    };
  }

  /**
   * Show help for a specific topic
   */
  async showHelp(topic) {
    const helpTopic = this.topics[topic];
    
    if (!helpTopic) {
      console.log(chalk.red(`Unknown help topic: ${topic}`));
      this.showTopicList();
      return;
    }
    
    console.log(chalk.bold.blue(`\n📚 ${helpTopic.title}\n`));
    console.log(helpTopic.content);
    
    if (helpTopic.relatedCommands && helpTopic.relatedCommands.length > 0) {
      console.log(chalk.bold('\n🔧 Related commands:'));
      helpTopic.relatedCommands.forEach(cmd => {
        console.log(chalk.gray(`  ${cmd}`));
      });
    }
    
    console.log('');
  }


  /**
   * Show available help topics in CLI format
   */
  showTopicList() {
    console.log(chalk.bold('\nGit Worktree Tool (wt) - Help\n'));
    
    console.log(chalk.bold('Main Commands:'));
    console.log(`  ${chalk.cyan('wt init')}                     Initialize worktree configuration`);
    console.log(`  ${chalk.cyan('wt create <branch>')}          Create a new worktree`);
    console.log(`  ${chalk.cyan('wt list')}                     List all worktrees`);
    console.log(`  ${chalk.cyan('wt switch <name>')}            Switch to a worktree`);
    console.log(`  ${chalk.cyan('wt merge <name>')}             Merge worktree to main`);
    console.log(`  ${chalk.cyan('wt remove <name>')}            Remove a worktree`);
    console.log(`  ${chalk.cyan('wt ports')}                    Show port assignments`);
    
    console.log(chalk.bold('\nUtility Commands:'));
    console.log(`  ${chalk.cyan('wt save-work')}                Save uncommitted changes`);
    console.log(`  ${chalk.cyan('wt restore-work')}             Restore saved changes`);
    console.log(`  ${chalk.cyan('wt conflicts')}                Manage merge conflicts`);
    console.log(`  ${chalk.cyan('wt recovery')}                 Recover lost work`);
    console.log(`  ${chalk.cyan('wt restore')}                  Restore from backups`);
    console.log(`  ${chalk.cyan('wt panic')}                    Emergency help`);
    
    console.log(chalk.bold('\nTroubleshooting Topics:'));
    Object.entries(this.topics).forEach(([key, topic]) => {
      console.log(`  ${chalk.cyan(key.padEnd(20))} ${topic.title}`);
    });
    
    console.log(chalk.bold('\nUsage:'));
    console.log(`  ${chalk.cyan('wt <command> --help')}         Show detailed help for any command`);
    console.log(`  ${chalk.cyan('wt help <topic>')}             Show help for troubleshooting topics`);
    console.log(`  ${chalk.cyan('wt help --interactive')}       Browse help topics interactively`);
    
    console.log(chalk.bold('\nExamples:'));
    console.log(`  ${chalk.gray('wt create --help              # Show options for create command')}`);
    console.log(`  ${chalk.gray('wt help merge-conflicts       # Learn about resolving conflicts')}`);
    console.log(`  ${chalk.gray('wt help lost-work             # Recover lost commits')}`);
    
    console.log(chalk.bold('\nQuick Start:'));
    console.log(`  ${chalk.gray('wt init                       # Set up worktrees in this repo')}`);
    console.log(`  ${chalk.gray('wt create my-feature          # Create worktree for my-feature branch')}`);
    console.log(`  ${chalk.gray('wt list                       # See all your worktrees')}`);
  }

  /**
   * Interactive help browser
   */
  async browse() {
    let shouldContinue = true;
    while (shouldContinue) {
      const { choice } = await inquirer.prompt([{
        type: 'list',
        name: 'choice',
        message: 'What would you like help with?',
        choices: [
          ...Object.entries(this.topics).map(([key, topic]) => ({
            name: topic.title,
            value: key
          })),
          new inquirer.Separator(),
          { name: 'Exit help', value: 'exit' }
        ]
      }]);
      
      if (choice === 'exit') {
        shouldContinue = false;
        break;
      }
      
      await this.showHelp(choice);
      
      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'What next?',
        choices: [
          { name: 'Browse another topic', value: 'browse' },
          { name: 'Exit help', value: 'exit' }
        ]
      }]);
      
      if (action === 'exit') {
        shouldContinue = false;
        break;
      }
    }
  }

  /**
   * Get contextual help based on current situation
   */
  getContextualHelp(context) {
    const suggestions = [];
    
    if (context.type === 'merge' && context.conflictCount > 0) {
      suggestions.push('Use "wt conflicts fix" to resolve conflicts interactively');
      suggestions.push('Run "wt help merge-conflicts" to understand merge conflicts');
      suggestions.push('Create a backup with "wt backup create" before continuing');
    }
    
    if (context.type === 'uncommitted-changes') {
      suggestions.push('Save changes with "wt save-work" before switching');
      suggestions.push('Commit changes with standard git commands');
      suggestions.push('Stash changes with "git stash" for quick storage');
    }
    
    if (context.type === 'lost-work') {
      suggestions.push('Use "wt recovery find-commits" to search for lost commits');
      suggestions.push('Check "wt recovery list-backups" for automatic backups');
      suggestions.push('Run "wt help lost-work" for detailed recovery steps');
    }
    
    return suggestions;
  }

  /**
   * Create a quick help snippet for inline display
   */
  getQuickHelp(topic) {
    const quickHelp = {
      'uncommitted-changes': 'Save with "wt stash" or commit with "wt commit -m"',
      'merge-conflict': 'Run "wt conflicts fix" to resolve interactively',
      'lost-commit': 'Use "wt recovery find-commits" to search for lost work',
      'backup-needed': 'Create a backup with "wt backup create"'
    };
    
    return quickHelp[topic] || 'Run "wt help" for assistance';
  }
}

// Singleton instance
let instance = null;

module.exports = {
  HelpSystem,
  
  /**
   * Get the help system instance
   */
  getInstance() {
    if (!instance) {
      instance = new HelpSystem();
    }
    return instance;
  },
  
  /**
   * Quick access to show help
   */
  async showHelp(topic) {
    const help = this.getInstance();
    await help.showHelp(topic);
  },
  
  /**
   * Quick access to browse help
   */
  async browse() {
    const help = this.getInstance();
    await help.browse();
  },
  
  /**
   * Quick access to show topic list
   */
  showTopicList() {
    const help = this.getInstance();
    help.showTopicList();
  }
};