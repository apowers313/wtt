const chalk = require('chalk');
const { MERGE_MESSAGES, ERROR_PATTERNS } = require('../../templates/messages');

class MessageFormatter {
  constructor() {
    this.patterns = ERROR_PATTERNS;
    this.messages = MERGE_MESSAGES;
  }

  formatError(gitError, context = {}) {
    const pattern = this.identifyErrorPattern(gitError);
    const template = this.getMessageTemplate(pattern);
    
    if (!template) {
      return {
        title: 'Git operation failed',
        explanation: 'An unexpected error occurred during the merge operation.',
        rawError: gitError,
        options: [
          {
            label: 'Get help',
            command: 'wt help merge',
            safe: true,
            skill: 'beginner',
            description: 'Show help and common solutions'
          }
        ],
        helpAvailable: ['merge-conflicts', 'git-basics']
      };
    }

    return {
      title: template.title,
      explanation: this.contextualizeMessage(template.explanation, context),
      options: this.rankOptionsBySkillLevel(this.contextualizeOptions(template.options, context), context.userSkill),
      helpAvailable: template.helpTopics || ['merge-conflicts']
    };
  }

  identifyErrorPattern(error) {
    let errorText;
    if (typeof error === 'string') {
      errorText = error;
    } else if (error && error.message) {
      errorText = error.message;
    } else if (error && typeof error.toString === 'function') {
      errorText = error.toString();
    } else {
      errorText = String(error);
    }
    
    for (const [patternName, regexArray] of Object.entries(this.patterns)) {
      if (regexArray.some(regex => regex.test(errorText))) {
        return patternName;
      }
    }
    return 'unknown';
  }

  getMessageTemplate(pattern) {
    return this.messages[pattern] || null;
  }

  contextualizeMessage(message, context) {
    if (!context.branch && !context.files && !context.mainBranch) {
      return message;
    }

    let contextualMessage = message;
    
    if (context.branch) {
      contextualMessage = contextualMessage.replace(/target branch/g, `'${context.branch}'`);
    }
    
    if (context.mainBranch) {
      contextualMessage = contextualMessage.replace(/main/g, context.mainBranch);
    }
    
    if (context.files && context.files.length > 0) {
      const fileList = context.files.slice(0, 3).join(', ');
      const moreFiles = context.files.length > 3 ? ` (and ${context.files.length - 3} more)` : '';
      contextualMessage += ` Affected files: ${fileList}${moreFiles}`;
    }
    
    return contextualMessage;
  }

  contextualizeOptions(options, context) {
    if (!context.mainBranch || !options) {
      return options;
    }

    return options.map(option => ({
      ...option,
      command: option.command ? option.command.replace(/main/g, context.mainBranch) : option.command,
      wttCommand: option.wttCommand ? option.wttCommand.replace(/main/g, context.mainBranch) : option.wttCommand,
      description: option.description ? option.description.replace(/main/g, context.mainBranch) : option.description
    }));
  }

  rankOptionsBySkillLevel(options, userSkill = 'beginner') {
    const skillOrder = { beginner: 0, intermediate: 1, advanced: 2 };
    const userSkillLevel = skillOrder[userSkill] || 0;
    
    return options
      .sort((a, b) => {
        const aLevel = skillOrder[a.skill] || 0;
        const bLevel = skillOrder[b.skill] || 0;
        
        // Prioritize safe options
        if (a.safe && !b.safe) return -1;
        if (!a.safe && b.safe) return 1;
        
        // Then sort by skill level relative to user
        const aDiff = Math.abs(aLevel - userSkillLevel);
        const bDiff = Math.abs(bLevel - userSkillLevel);
        
        return aDiff - bDiff;
      });
  }

  displayFormattedError(errorInfo, options = {}) {
    // Check if we should use simple error mode
    const errorLevel = process.env.WTT_ERROR_LEVEL || 'enhanced';
    if (errorLevel === 'simple') {
      // In simple mode, just output the basic explanation without formatting
      console.log(errorInfo.explanation);
      return;
    }
    
    console.log(chalk.red.bold(`\n❌ ${errorInfo.title}\n`));
    console.log(chalk.yellow(errorInfo.explanation));
    
    if (errorInfo.rawError && options.verbose) {
      console.log(chalk.gray(`\nOriginal error: ${errorInfo.rawError}`));
    }
    
    if (errorInfo.options && errorInfo.options.length > 0) {
      console.log(chalk.blue.bold('\n🔧 Resolution Options:\n'));
      
      errorInfo.options.forEach((option, index) => {
        const number = chalk.cyan(`${index + 1})`);
        const safeIcon = option.safe ? chalk.green('✅') : chalk.yellow('⚠️');
        const skillBadge = chalk.gray(`[${option.skill}]`);
        
        console.log(`${number} ${option.label} ${safeIcon} ${skillBadge}`);
        console.log(chalk.gray(`   ${option.description}`));
        
        if (option.wttCommand) {
          console.log(chalk.blue(`   Command: ${option.wttCommand}`));
        } else if (option.command) {
          console.log(chalk.gray(`   Git: ${option.command}`));
        }
        
        if (option.warning) {
          console.log(chalk.red(`   ⚠️  ${option.warning}`));
        }
        
        console.log(); // Empty line between options
      });
    }
    
    if (errorInfo.helpAvailable && errorInfo.helpAvailable.length > 0) {
      console.log(chalk.blue('💡 Need more help? Try:'));
      errorInfo.helpAvailable.forEach(topic => {
        console.log(chalk.gray(`   wt help ${topic}`));
      });
    }
  }

  // Helper method to extract context from git output
  extractContext(gitOutput, operation = 'merge') {
    const context = { operation };
    
    // Extract branch names
    const branchMatch = gitOutput.match(/into (['"]?)([^'"\s]+)\1/);
    if (branchMatch) {
      context.branch = branchMatch[2];
    }
    
    // Extract conflicted files
    const conflictFiles = [];
    const lines = gitOutput.split('\n');
    for (const line of lines) {
      if (line.includes('CONFLICT') && line.includes('in ')) {
        const fileMatch = line.match(/in (.+?)(?:\s|$)/);
        if (fileMatch) {
          conflictFiles.push(fileMatch[1]);
        }
      }
    }
    
    if (conflictFiles.length > 0) {
      context.files = conflictFiles;
    }
    
    return context;
  }

  // Quick helper for common merge error scenarios
  formatMergeError(error, mainBranch, userSkill = 'beginner') {
    const context = {
      mainBranch,
      userSkill,
      operation: 'merge'
    };
    
    if (typeof error === 'object' && error.stdout) {
      Object.assign(context, this.extractContext(error.stdout));
    }
    
    return this.formatError(error, context);
  }

  // Format stash-related errors
  formatStashError(error, context = {}) {
    const errorStr = error.message || error.toString();
    
    if (errorStr.includes('No stash entries found')) {
      return {
        title: 'No saved work found',
        explanation: 'There is no saved work to restore.',
        options: [
          {
            label: 'Save your current work',
            command: 'wt save-work',
            description: 'Save uncommitted changes for later'
          }
        ]
      };
    }
    
    if (errorStr.includes('conflict')) {
      return {
        title: 'Conflicts while restoring work',
        explanation: 'Your saved work conflicts with current changes.',
        options: [
          {
            label: 'Resolve conflicts',
            command: 'wt conflicts fix',
            description: 'Fix conflicts interactively'
          },
          {
            label: 'Apply without removing from stash',
            command: 'git stash apply',
            description: 'Keep the stash for later use'
          },
          {
            label: 'Cancel the restore',
            command: 'git reset --hard',
            description: 'Discard the conflicted state'
          }
        ]
      };
    }
    
    return this.formatError(error, context);
  }
}

module.exports = MessageFormatter;