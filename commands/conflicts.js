const chalk = require('chalk');
const config = require('../lib/config');
const gitOps = require('../lib/gitOps');
const ConflictDetector = require('../lib/merge-helper/conflict-detector');
const ConflictResolver = require('../lib/merge-helper/conflict-resolver');
const ProgressUI = require('../lib/ui/progress-ui');
const { addCommandContext } = require('../lib/errorTranslator');

/**
 * List all current conflicts
 */
async function conflictsListCommand(options = {}) {
  try {
    await gitOps.validateRepository();
    
    const detector = new ConflictDetector();
    const conflicts = await detector.findConflicts();
    
    if (conflicts.length === 0) {
      console.log(chalk.green('✅ No conflicts found!'));
      return;
    }
    
    console.log(chalk.red.bold(`\n⚠️  ${conflicts.length} file(s) with conflicts:\n`));
    
    for (const conflict of conflicts) {
      const icon = getConflictTypeIcon(conflict.type);
      console.log(`${icon} ${chalk.cyan(conflict.file)} (${conflict.count} conflict${conflict.count > 1 ? 's' : ''})`);
      
      if (options.verbose) {
        console.log(chalk.gray(`   Type: ${conflict.type}`));
        
        if (conflict.conflicts && conflict.conflicts.length > 0) {
          conflict.conflicts.forEach((c, index) => {
            console.log(chalk.gray(`   Conflict ${index + 1}: lines ${c.startLine}-${c.endLine}`));
          });
        }
      }
    }
    
    // Show summary statistics
    if (options.verbose) {
      const stats = await detector.getConflictStats();
      console.log('');
      ProgressUI.displayConflictStats(stats);
    }
    
    console.log(chalk.yellow('\nTo resolve conflicts:'));
    console.log(chalk.gray('  wt conflicts fix            # Resolve all interactively'));
    console.log(chalk.gray('  wt conflicts fix <file>     # Resolve specific file'));
    console.log(chalk.gray('  wt conflicts fix --tool=vscode  # Use external tool'));
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    const context = addCommandContext(error.message, 'conflicts list');
    if (context.tips && context.tips.length > 0) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

/**
 * Fix conflicts interactively
 */
async function conflictsFixCommand(file, options = {}) {
  try {
    await gitOps.validateRepository();
    
    const resolver = new ConflictResolver();
    
    if (file) {
      // Resolve specific file
      await resolver.resolveFile(file, options);
    } else if (options.accept) {
      // Accept all from one side
      await resolver.acceptAll(options.accept);
    } else {
      // Resolve all conflicts
      await resolver.resolveAll(options);
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    const context = addCommandContext(error.message, 'conflicts fix');
    if (context.tips && context.tips.length > 0) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

/**
 * Predict potential conflicts
 */
async function conflictsPredictCommand(targetBranch, options = {}) {
  try {
    await gitOps.validateRepository();
    await config.load();
    
    const detector = new ConflictDetector();
    const branch = targetBranch || await gitOps.getMainBranch(config.get());
    
    console.log(chalk.blue(`Analyzing potential conflicts with ${branch}...\n`));
    
    const spinner = ProgressUI.createSpinner('Analyzing code overlap');
    spinner.start();
    
    const predictions = await detector.predictConflicts(branch);
    
    spinner.stop('Analysis complete');
    
    if (predictions.length === 0) {
      console.log(chalk.green('\n✅ No conflicts predicted!'));
      console.log(chalk.gray('Your branch should merge cleanly.'));
      return;
    }
    
    console.log(chalk.yellow(`\n⚠️  ${predictions.length} potential conflict(s) detected:\n`));
    
    // Group by risk level
    const byRisk = {
      high: predictions.filter(p => p.risk === 'high'),
      medium: predictions.filter(p => p.risk === 'medium'),
      low: predictions.filter(p => p.risk === 'low')
    };
    
    // Display high risk first
    if (byRisk.high.length > 0) {
      console.log(chalk.red.bold('High risk conflicts:'));
      byRisk.high.forEach(prediction => {
        console.log(chalk.red(`  ⚠️  ${prediction.file}`));
        console.log(chalk.gray(`     ${prediction.reason}`));
        if (options.verbose) {
          console.log(chalk.gray(`     Your change: ${prediction.ourChange}, Their change: ${prediction.theirChange}`));
        }
      });
      console.log('');
    }
    
    // Display medium risk
    if (byRisk.medium.length > 0) {
      console.log(chalk.yellow.bold('Medium risk conflicts:'));
      byRisk.medium.forEach(prediction => {
        console.log(chalk.yellow(`  ⚠️  ${prediction.file}`));
        console.log(chalk.gray(`     ${prediction.reason}`));
      });
      console.log('');
    }
    
    // Display low risk
    if (byRisk.low.length > 0 && options.verbose) {
      console.log(chalk.gray.bold('Low risk conflicts:'));
      byRisk.low.forEach(prediction => {
        console.log(chalk.gray(`  ⚠️  ${prediction.file}`));
        console.log(chalk.gray(`     ${prediction.reason}`));
      });
      console.log('');
    }
    
    // Suggestions
    console.log(chalk.cyan('💡 Suggestions:'));
    
    if (byRisk.high.length > 0) {
      console.log(chalk.gray('  • High-risk conflicts need careful attention'));
      console.log(chalk.gray('  • Consider syncing with the team before merging'));
    }
    
    console.log(chalk.gray(`  • Run 'wt merge ${branch} --check' to preview the merge`));
    console.log(chalk.gray('  • Create a backup before merging: wt backup create'));
    
    // Check for cross-worktree conflicts if applicable
    if (options.allWorktrees) {
      await checkCrossWorktreeConflicts();
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    const context = addCommandContext(error.message, 'conflicts predict');
    if (context.tips && context.tips.length > 0) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

/**
 * Check for conflicts across all worktrees
 */
async function checkCrossWorktreeConflicts() {
  console.log(chalk.blue('\n\nChecking for cross-worktree conflicts...\n'));
  
  try {
    const worktrees = await gitOps.getWorktrees();
    const activeWorktrees = worktrees.filter(wt => !wt.isMainWorktree);
    
    if (activeWorktrees.length < 2) {
      console.log(chalk.gray('Not enough worktrees to check for cross-conflicts.'));
      return;
    }
    
    const detector = new ConflictDetector();
    const conflicts = [];
    
    // Compare each pair of worktrees
    for (let i = 0; i < activeWorktrees.length; i++) {
      for (let j = i + 1; j < activeWorktrees.length; j++) {
        const wt1 = activeWorktrees[i];
        const wt2 = activeWorktrees[j];
        
        // Get changed files in each worktree
        const changes1 = await detector.getChangedFiles(wt1.branch, await gitOps.getMainBranch(config.get()));
        const changes2 = await detector.getChangedFiles(wt2.branch, await gitOps.getMainBranch(config.get()));
        
        // Find overlapping files
        const overlap = [];
        for (const [file] of changes1) {
          if (changes2.has(file)) {
            overlap.push(file);
          }
        }
        
        if (overlap.length > 0) {
          conflicts.push({
            worktree1: wt1.name,
            worktree2: wt2.name,
            files: overlap
          });
        }
      }
    }
    
    if (conflicts.length === 0) {
      console.log(chalk.green('✅ No cross-worktree conflicts detected.'));
    } else {
      console.log(chalk.yellow('⚠️  Potential conflicts between worktrees:\n'));
      
      conflicts.forEach(conflict => {
        console.log(chalk.yellow(`${conflict.worktree1} ↔ ${conflict.worktree2}`));
        conflict.files.forEach(file => {
          console.log(chalk.gray(`   └─ ${file}`));
        });
        console.log('');
      });
      
      console.log(chalk.cyan('💡 Consider merging worktrees in order to minimize conflicts.'));
    }
  } catch (error) {
    console.log(chalk.yellow('Could not check cross-worktree conflicts:', error.message));
  }
}

/**
 * Get icon for conflict type
 */
function getConflictTypeIcon(type) {
  const icons = {
    'modify/modify': '✏️',
    'delete/modify': '🗑️',
    'modify/delete': '🗑️',
    'binary': '📦',
    'unknown': '❓'
  };
  return icons[type] || '📄';
}

/**
 * Accept all conflicts from one side
 */
async function conflictsAcceptCommand(side) {
  try {
    await gitOps.validateRepository();
    
    if (!['ours', 'theirs'].includes(side)) {
      throw new Error('Side must be either "ours" or "theirs"');
    }
    
    const resolver = new ConflictResolver();
    await resolver.acceptAll(side);
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    const context = addCommandContext(error.message, 'conflicts accept');
    if (context.tips && context.tips.length > 0) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

module.exports = {
  conflictsListCommand,
  conflictsFixCommand,
  conflictsPredictCommand,
  conflictsAcceptCommand
};