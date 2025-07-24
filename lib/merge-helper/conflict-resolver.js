const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ConflictUI = require('../ui/conflict-ui');
const ProgressTracker = require('./progress-tracker');
const ConflictDetector = require('./conflict-detector');
const { spawn } = require('child_process');

class ConflictResolver {
  constructor() {
    this.ui = new ConflictUI();
    this.detector = new ConflictDetector();
  }

  /**
   * Resolve all conflicts interactively
   */
  async resolveAll(options = {}) {
    const conflicts = await this.detector.findConflicts();
    
    if (conflicts.length === 0) {
      console.log(chalk.green('✅ No conflicts to resolve!'));
      return;
    }

    const progress = new ProgressTracker(conflicts.length);
    progress.start('Resolving conflicts');

    for (const fileConflict of conflicts) {
      progress.update(fileConflict.file, 'in_progress');
      
      try {
        if (options.tool) {
          await this.resolveWithTool(fileConflict.file, options.tool);
        } else {
          await this.resolveFile(fileConflict.file, options);
        }
        
        progress.update(fileConflict.file, 'completed');
      } catch (error) {
        progress.update(fileConflict.file, 'error');
        console.error(chalk.red(`\nError resolving ${fileConflict.file}: ${error.message}`));
        
        const { continueResolving } = await inquirer.prompt([{
          type: 'confirm',
          name: 'continueResolving',
          message: 'Continue with other files?',
          default: true
        }]);
        
        if (!continueResolving) {
          break;
        }
      }
    }

    progress.complete();
  }

  /**
   * Resolve conflicts in a specific file
   */
  async resolveFile(filePath) {
    const conflictInfo = await this.detector.analyzeFileConflicts(filePath);
    
    if (conflictInfo.count === 0) {
      console.log(chalk.yellow(`No conflicts found in ${filePath}`));
      return;
    }

    console.log(chalk.blue(`\nResolving ${conflictInfo.count} conflict(s) in ${filePath}\n`));

    const fileContent = await fs.readFile(filePath, 'utf8');
    let resolvedContent = fileContent;

    // Sort conflicts by line number in reverse order to avoid offset issues
    const sortedConflicts = conflictInfo.conflicts.sort((a, b) => b.startLine - a.startLine);

    for (const conflict of sortedConflicts) {
      const resolution = await this.presentConflictOptions({
        file: filePath,
        ...conflict,
        fileType: path.extname(filePath)
      });

      resolvedContent = await this.applyResolution(resolvedContent, conflict, resolution);
    }

    // Write resolved content
    await fs.writeFile(filePath, resolvedContent);
    
    // Stage the resolved file
    const { stageFile } = await inquirer.prompt([{
      type: 'confirm',
      name: 'stageFile',
      message: `Stage ${filePath} for commit?`,
      default: true
    }]);

    if (stageFile) {
      const { simpleGit } = require('simple-git');
      await simpleGit().add(filePath);
      console.log(chalk.green(`✅ ${filePath} resolved and staged`));
    } else {
      console.log(chalk.green(`✅ ${filePath} resolved (not staged)`));
    }
  }

  /**
   * Present conflict resolution options to user
   */
  async presentConflictOptions(conflict) {
    // Show the conflict visually
    await this.ui.showConflict({
      file: conflict.file,
      lineNumber: conflict.startLine,
      yourVersion: conflict.ours.join('\n'),
      theirVersion: conflict.theirs.join('\n'),
      context: conflict.context
    });

    // Generate resolution options
    const options = this.generateResolutionOptions(conflict);
    
    // Get user choice
    const resolution = await this.ui.promptForChoice(options);
    
    // Handle special resolution types
    if (resolution.action === 'custom') {
      resolution.content = await this.getCustomResolution(conflict);
    } else if (resolution.action === 'view_context') {
      await this.showExtendedContext(conflict);
      return this.presentConflictOptions(conflict); // Re-present options
    } else if (resolution.action === 'help') {
      await this.showConflictHelp(conflict);
      return this.presentConflictOptions(conflict); // Re-present options
    }

    return resolution;
  }

  /**
   * Generate resolution options based on conflict type
   */
  generateResolutionOptions(conflict) {
    const options = [
      {
        label: 'Keep your version',
        action: 'keep_ours',
        content: conflict.ours.join('\n'),
        safe: true,
        skill: 'beginner'
      },
      {
        label: 'Keep team\'s version',
        action: 'keep_theirs',
        content: conflict.theirs.join('\n'),
        safe: true,
        skill: 'beginner'
      }
    ];

    // Add smart resolution options based on content
    const smartOptions = this.generateSmartOptions(conflict);
    options.push(...smartOptions);

    // Always add these options
    options.push(
      {
        label: 'Write a custom version',
        action: 'custom',
        safe: true,
        skill: 'intermediate'
      },
      {
        label: 'Keep both (requires manual cleanup)',
        action: 'keep_both',
        content: `${conflict.ours.join('\n')}\n// TODO: Manual merge needed\n${conflict.theirs.join('\n')}`,
        safe: false,
        skill: 'advanced',
        warning: 'You will need to manually clean up the code'
      },
      {
        label: 'View more context',
        action: 'view_context',
        safe: true,
        skill: 'beginner'
      },
      {
        label: 'Get help',
        action: 'help',
        safe: true,
        skill: 'beginner'
      }
    );

    return options;
  }

  /**
   * Generate smart resolution options based on conflict content
   */
  generateSmartOptions(conflict) {
    const options = [];
    
    // Check if it's a simple value change
    if (conflict.ours.length === 1 && conflict.theirs.length === 1) {
      const ourLine = conflict.ours[0].trim();
      const theirLine = conflict.theirs[0].trim();
      
      // Check for numeric value conflicts
      const ourMatch = ourLine.match(/(\w+)\s*=\s*(\d+)/);
      const theirMatch = theirLine.match(/(\w+)\s*=\s*(\d+)/);
      
      if (ourMatch && theirMatch && ourMatch[1] === theirMatch[1]) {
        const ourValue = parseInt(ourMatch[2]);
        const theirValue = parseInt(theirMatch[2]);
        
        // Suggest average
        const avgValue = Math.round((ourValue + theirValue) / 2);
        options.push({
          label: `Use average value (${avgValue})`,
          action: 'smart_average',
          content: ourLine.replace(/\d+/, avgValue),
          safe: true,
          skill: 'intermediate'
        });
        
        // Suggest min/max
        options.push({
          label: `Use smaller value (${Math.min(ourValue, theirValue)})`,
          action: 'smart_min',
          content: ourLine.replace(/\d+/, Math.min(ourValue, theirValue)),
          safe: true,
          skill: 'intermediate'
        });
      }
    }
    
    // Check for import/require conflicts
    if (this.isImportConflict(conflict)) {
      options.push({
        label: 'Combine both imports',
        action: 'combine_imports',
        content: this.combineImports(conflict.ours, conflict.theirs),
        safe: true,
        skill: 'intermediate'
      });
    }
    
    return options;
  }

  /**
   * Check if conflict is in import statements
   */
  isImportConflict(conflict) {
    const allLines = [...conflict.ours, ...conflict.theirs];
    return allLines.every(line => 
      line.includes('import') || 
      line.includes('require') || 
      line.includes('from') ||
      line.trim() === ''
    );
  }

  /**
   * Combine import statements intelligently
   */
  combineImports(ours, theirs) {
    const allImports = new Set([
      ...ours.filter(line => line.trim()),
      ...theirs.filter(line => line.trim())
    ]);
    return Array.from(allImports).sort().join('\n');
  }

  /**
   * Get custom resolution from user
   */
  async getCustomResolution(conflict) {
    console.log(chalk.cyan('\nEnter your custom resolution (press Ctrl+D when done):'));
    console.log(chalk.gray('Original versions shown above for reference\n'));
    
    // Use editor if available
    const editor = process.env.EDITOR || 'vi';
    const tempFile = path.join(process.env.TMPDIR || '/tmp', `conflict-${Date.now()}.tmp`);
    
    // Write current content to temp file
    const template = `// Your version:\n${conflict.ours.join('\n')}\n\n// Their version:\n${conflict.theirs.join('\n')}\n\n// Write your resolution below:\n`;
    await fs.writeFile(tempFile, template);
    
    // Open in editor
    await new Promise((resolve, reject) => {
      const child = spawn(editor, [tempFile], { stdio: 'inherit' });
      child.on('exit', resolve);
      child.on('error', reject);
    });
    
    // Read the result
    const content = await fs.readFile(tempFile, 'utf8');
    await fs.unlink(tempFile);
    
    // Extract resolution (everything after "Write your resolution below:")
    const resolutionMatch = content.match(/Write your resolution below:\n([\s\S]*)/);
    return resolutionMatch ? resolutionMatch[1].trim() : '';
  }

  /**
   * Show extended context around conflict
   */
  async showExtendedContext(conflict) {
    const context = await this.detector.getConflictContext(conflict.file, conflict.startLine, 10);
    
    console.log(chalk.blue('\n📄 Extended context:\n'));
    
    if (context.before.length > 0) {
      console.log(chalk.gray('Before conflict:'));
      context.before.forEach((line, i) => {
        console.log(chalk.gray(`  ${conflict.startLine - context.before.length + i}: ${line}`));
      });
    }
    
    console.log(chalk.yellow('\n[Conflict location]\n'));
    
    if (context.after.length > 0) {
      console.log(chalk.gray('After conflict:'));
      context.after.forEach((line, i) => {
        console.log(chalk.gray(`  ${conflict.endLine + i + 1}: ${line}`));
      });
    }
    
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: 'Press Enter to continue...'
    }]);
  }

  /**
   * Show help for resolving conflicts
   */
  async showConflictHelp(_conflict) {
    console.log(chalk.blue('\n📚 Conflict Resolution Help\n'));
    
    console.log(chalk.white('This conflict shows two different versions of the same code:'));
    console.log(chalk.gray('- Your version: Changes you made in your branch'));
    console.log(chalk.gray('- Team\'s version: Changes from the branch you\'re merging\n'));
    
    console.log(chalk.white('Resolution options:'));
    console.log(chalk.green('✅ Safe options:'));
    console.log(chalk.gray('  - Keep one version: Choose if one version is clearly correct'));
    console.log(chalk.gray('  - Custom version: Write new code that combines both changes\n'));
    
    console.log(chalk.yellow('⚠️  Advanced options:'));
    console.log(chalk.gray('  - Keep both: Preserves both versions (requires cleanup)'));
    console.log(chalk.gray('  - External tool: Use VS Code or other merge tools\n'));
    
    console.log(chalk.white('Tips:'));
    console.log(chalk.gray('  1. Look at what each version is trying to accomplish'));
    console.log(chalk.gray('  2. Consider if both changes are needed'));
    console.log(chalk.gray('  3. Check surrounding code for context'));
    console.log(chalk.gray('  4. Test after resolving to ensure code works\n'));
    
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: 'Press Enter to continue...'
    }]);
  }

  /**
   * Apply resolution to file content
   */
  async applyResolution(content, conflict, resolution) {
    const lines = content.split('\n');
    
    // Remove conflict markers and content
    const beforeConflict = lines.slice(0, conflict.startLine - 1);
    const afterConflict = lines.slice(conflict.endLine);
    
    // Insert resolution
    const resolvedLines = [
      ...beforeConflict,
      ...resolution.content.split('\n'),
      ...afterConflict
    ];
    
    return resolvedLines.join('\n');
  }

  /**
   * Resolve using external merge tool
   */
  async resolveWithTool(filePath, toolName) {
    const tools = {
      vscode: 'code --wait --merge',
      vim: 'vimdiff',
      emacs: 'emacs --eval "(ediff-merge-files-with-ancestor"',
      meld: 'meld'
    };
    
    const command = tools[toolName] || toolName;
    
    console.log(chalk.blue(`Opening ${filePath} in ${toolName}...`));
    
    await new Promise((resolve, reject) => {
      const child = spawn(command, [filePath], { 
        shell: true,
        stdio: 'inherit' 
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Tool exited with code ${code}`));
        }
      });
      
      child.on('error', reject);
    });
    
    // Check if conflicts are resolved
    const conflictInfo = await this.detector.analyzeFileConflicts(filePath);
    if (conflictInfo.count > 0) {
      console.log(chalk.yellow(`\n⚠️  ${conflictInfo.count} conflict(s) still remain in ${filePath}`));
      
      const { continueWithFile } = await inquirer.prompt([{
        type: 'confirm',
        name: 'continueWithFile',
        message: 'Mark as resolved anyway?',
        default: false
      }]);
      
      if (!continueWithFile) {
        throw new Error('Conflicts not fully resolved');
      }
    }
  }

  /**
   * Accept all conflicts from one side
   */
  async acceptAll(side) {
    const conflicts = await this.detector.findConflicts();
    
    if (conflicts.length === 0) {
      console.log(chalk.green('✅ No conflicts to resolve!'));
      return;
    }

    const { confirmAcceptAll } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmAcceptAll',
      message: `Accept ${side === 'ours' ? 'all your changes' : 'all their changes'} for ${conflicts.length} file(s)?`,
      default: false
    }]);

    if (!confirmAcceptAll) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }

    const { simpleGit } = require('simple-git');
    const git = simpleGit();

    for (const conflict of conflicts) {
      if (side === 'ours') {
        await git.checkout(['--ours', conflict.file]);
      } else {
        await git.checkout(['--theirs', conflict.file]);
      }
      await git.add(conflict.file);
      console.log(chalk.green(`✅ Accepted ${side} for ${conflict.file}`));
    }

    console.log(chalk.green(`\n✅ All conflicts resolved using ${side === 'ours' ? 'your' : 'their'} changes`));
  }
}

module.exports = ConflictResolver;