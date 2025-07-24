const chalk = require('chalk');
const inquirer = require('inquirer');

class ConflictUI {
  constructor() {
    this.currentConflict = null;
  }

  async showConflict(conflict) {
    console.clear();
    console.log(chalk.red.bold(`CONFLICT in ${conflict.file}`));
    console.log(chalk.gray(`Line ${conflict.lineNumber || 'unknown'}`));
    console.log('\nThe same code was changed in two different ways:\n');
    
    // Show your version
    console.log(chalk.blue('┌─── YOUR VERSION ─────────────────┐'));
    const yourLines = conflict.yourVersion.split('\n');
    yourLines.forEach(line => {
      const paddedLine = line.padEnd(31);
      console.log(chalk.blue(`│ ${paddedLine} │`));
    });
    console.log(chalk.blue('└─────────────────────────────────┘\n'));
    
    // Show their version
    console.log(chalk.green('┌─── TEAM\'S VERSION ──────────────┐'));
    const theirLines = conflict.theirVersion.split('\n');
    theirLines.forEach(line => {
      const paddedLine = line.padEnd(31);
      console.log(chalk.green(`│ ${paddedLine} │`));
    });
    console.log(chalk.green('└─────────────────────────────────┘\n'));

    // Show context if available
    if (conflict.context && conflict.context.before) {
      console.log(chalk.gray('Context before:'));
      conflict.context.before.forEach(line => {
        console.log(chalk.gray(`  ${line}`));
      });
      console.log();
    }

    if (conflict.context && conflict.context.after) {
      console.log(chalk.gray('Context after:'));
      conflict.context.after.forEach(line => {
        console.log(chalk.gray(`  ${line}`));
      });
      console.log();
    }

    this.currentConflict = conflict;
  }
  
  async promptForChoice(options) {
    if (!options || options.length === 0) {
      options = this.getDefaultOptions();
    }

    const choices = options.map((opt, index) => {
      const safeIcon = opt.safe ? chalk.green('✅') : chalk.yellow('⚠️');
      const skillBadge = chalk.gray(`[${opt.skill || 'any'}]`);
      const description = opt.description ? chalk.gray(` - ${opt.description}`) : '';
      
      return {
        name: `${opt.label} ${safeIcon} ${skillBadge}${description}`,
        value: index,
        short: opt.label
      };
    });

    // Add separator and help options
    choices.push(new inquirer.Separator());
    choices.push({
      name: chalk.blue('🔍 Show more context'),
      value: 'more-context',
      short: 'More context'
    });
    choices.push({
      name: chalk.blue('❓ Get help with this conflict'),
      value: 'help',
      short: 'Help'
    });
    choices.push({
      name: chalk.red('🚨 I need help - this is too complex'),
      value: 'panic',
      short: 'Panic'
    });
    
    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'choice',
      message: 'What would you like to do?',
      choices,
      pageSize: 15
    }]);
    
    // Handle special choices
    if (answer.choice === 'more-context') {
      await this.showMoreContext();
      return await this.promptForChoice(options); // Re-prompt
    }
    
    if (answer.choice === 'help') {
      await this.showConflictHelp();
      return await this.promptForChoice(options); // Re-prompt
    }
    
    if (answer.choice === 'panic') {
      return { action: 'panic' };
    }
    
    return options[answer.choice];
  }

  async showMoreContext() {
    if (!this.currentConflict) return;

    console.log(chalk.blue.bold('\n📋 Extended Context\n'));
    
    // Show file path and conflict summary
    console.log(chalk.gray(`File: ${this.currentConflict.file}`));
    console.log(chalk.gray(`Type: ${this.getConflictType(this.currentConflict)}`));
    console.log();

    // Show extended before/after context if available
    if (this.currentConflict.extendedContext) {
      console.log(chalk.blue('Extended context before:'));
      this.currentConflict.extendedContext.before.forEach((line, i) => {
        console.log(chalk.gray(`${(this.currentConflict.lineNumber - 10 + i).toString().padStart(4)}: ${line}`));
      });
      console.log();

      console.log(chalk.blue('Extended context after:'));
      this.currentConflict.extendedContext.after.forEach((line, i) => {
        console.log(chalk.gray(`${(this.currentConflict.lineNumber + 5 + i).toString().padStart(4)}: ${line}`));
      });
      console.log();
    }

    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: 'Press Enter to continue...'
    }]);
  }

  async showConflictHelp() {
    console.log(chalk.blue.bold('\n📚 Conflict Resolution Help\n'));
    
    console.log(chalk.yellow('What are merge conflicts?'));
    console.log('Merge conflicts happen when Git can\'t automatically combine changes from two branches.');
    console.log('This usually occurs when both branches modified the same lines of code.\n');
    
    console.log(chalk.yellow('How to resolve them:'));
    console.log('1. 📝 Choose one version (yours or theirs)');
    console.log('2. ✏️  Manually edit to combine both changes');
    console.log('3. 🗑️  Write completely new code\n');
    
    console.log(chalk.yellow('Tips:'));
    console.log('• Start with the safest option (recommended)');
    console.log('• When in doubt, keep both changes temporarily');
    console.log('• You can always undo and try a different approach');
    console.log('• Use the panic button if you\'re stuck\n');

    const conflictType = this.getConflictType(this.currentConflict);
    if (conflictType) {
      console.log(chalk.yellow(`Specific help for ${conflictType} conflicts:`));
      console.log(this.getConflictTypeHelp(conflictType));
      console.log();
    }

    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: 'Press Enter to continue...'
    }]);
  }

  getConflictType(conflict) {
    if (!conflict) return 'unknown';
    
    if (conflict.yourVersion.includes('function') || conflict.theirVersion.includes('function')) {
      return 'function-definition';
    }
    if (conflict.yourVersion.includes('import') || conflict.theirVersion.includes('import')) {
      return 'import-statement';
    }
    if (conflict.yourVersion.includes('=') || conflict.theirVersion.includes('=')) {
      return 'variable-assignment';
    }
    if (conflict.yourVersion.includes('//') || conflict.theirVersion.includes('//')) {
      return 'comment-conflict';
    }
    
    return 'code-change';
  }

  getConflictTypeHelp(type) {
    const helpText = {
      'function-definition': '• Function conflicts often need both changes combined\n• Check if parameters or logic need to be merged\n• Consider if both versions serve different purposes',
      'import-statement': '• Usually safe to keep both imports\n• Check if imports conflict with each other\n• Remove duplicate imports',
      'variable-assignment': '• Consider which value makes more sense\n• Check if both values are needed for different cases\n• Look at how the variable is used elsewhere',
      'comment-conflict': '• Comments are usually safe to combine\n• Keep the most informative version\n• Consider if both comments add value',
      'code-change': '• Read the changes carefully\n• Consider the intent behind each change\n• Test the result if possible'
    };
    
    return helpText[type] || '• Carefully review both versions\n• Consider the purpose of each change\n• When in doubt, ask for help';
  }

  getDefaultOptions() {
    return [
      {
        label: 'Keep your version',
        action: 'ours',
        safe: true,
        skill: 'beginner',
        description: 'Use your changes'
      },
      {
        label: 'Keep their version',
        action: 'theirs',
        safe: true,
        skill: 'beginner', 
        description: 'Use their changes'
      },
      {
        label: 'Edit manually',
        action: 'edit',
        safe: true,
        skill: 'intermediate',
        description: 'Combine or modify both versions'
      },
      {
        label: 'Keep both (needs cleanup)',
        action: 'both',
        safe: false,
        skill: 'intermediate',
        description: 'Include both versions - you\'ll need to clean up'
      }
    ];
  }

  displayProgress(current, total, fileName) {
    const percent = Math.round((current / total) * 100);
    const progressBar = '='.repeat(Math.floor(percent / 5));
    const remaining = ' '.repeat(20 - progressBar.length);
    
    console.log(chalk.bold('\nConflict Resolution Progress\n'));
    console.log(`[${progressBar}>${remaining}] ${percent}% complete`);
    console.log(`Resolving conflict ${current} of ${total}`);
    if (fileName) {
      console.log(chalk.gray(`Current file: ${fileName}`));
    }
    console.log();
  }

  displaySummary(resolved, total, timeElapsed) {
    console.log(chalk.green.bold('\n✅ Conflict Resolution Complete!\n'));
    console.log(chalk.green(`✓ Resolved ${resolved} of ${total} conflicts`));
    
    if (timeElapsed) {
      console.log(chalk.gray(`⏱️  Time taken: ${Math.round(timeElapsed / 1000)}s`));
    }
    
    console.log(chalk.yellow('\nNext steps:'));
    console.log(chalk.gray('1. Review your changes'));
    console.log(chalk.gray('2. Test if possible'));
    console.log(chalk.gray('3. Commit the merge'));
    console.log();
  }

  async confirmResolution(conflict, resolution) {
    console.log(chalk.blue('\n📋 Conflict Resolution Summary:'));
    console.log(chalk.gray(`File: ${conflict.file}`));
    console.log(chalk.gray(`Action: ${resolution.label}`));
    
    if (resolution.action === 'edit') {
      console.log(chalk.yellow('\nYou chose to edit manually.'));
      console.log(chalk.gray('The file will be opened in your default editor.'));
    } else if (resolution.action === 'both') {
      console.log(chalk.yellow('\nYou chose to keep both versions.'));
      console.log(chalk.gray('Remember to clean up the duplicate code afterward.'));
    }
    
    const confirm = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Apply this resolution?',
      default: true
    }]);
    
    return confirm.proceed;
  }
}

module.exports = ConflictUI;