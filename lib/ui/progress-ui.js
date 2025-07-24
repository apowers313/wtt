const chalk = require('chalk');
const ProgressTracker = require('../merge-helper/progress-tracker');

class ProgressUI {
  /**
   * Display merge progress with visual elements
   */
  static displayMergeProgress(fromBranch, toBranch, steps) {
    console.log(chalk.bold(`Merge Progress: ${fromBranch} → ${toBranch}\n`));
    
    const tracker = new ProgressTracker.SectionProgressTracker(steps);
    return tracker;
  }

  /**
   * Display conflict resolution progress
   */
  static displayConflictProgress(conflicts) {
    const total = conflicts.reduce((sum, file) => sum + file.count, 0);
    console.log(chalk.bold(`Resolving ${total} conflicts in ${conflicts.length} files\n`));
    
    const tracker = new ProgressTracker(conflicts.length);
    tracker.start('Conflict Resolution');
    return tracker;
  }

  /**
   * Display file operation progress
   */
  static displayFileProgress(operation, files) {
    const tracker = new ProgressTracker(files.length);
    tracker.start(operation);
    return tracker;
  }

  /**
   * Create a spinner for indeterminate progress
   */
  static createSpinner(message) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let current = 0;
    let interval;
    
    const spinner = {
      start: () => {
        process.stdout.write(`${frames[current]} ${message}`);
        interval = setInterval(() => {
          process.stdout.write(`\r${frames[current]} ${message}`);
          current = (current + 1) % frames.length;
        }, 80);
      },
      
      stop: (finalMessage) => {
        clearInterval(interval);
        process.stdout.write(`\r✓ ${finalMessage || message}\n`);
      },
      
      fail: (errorMessage) => {
        clearInterval(interval);
        process.stdout.write(`\r✗ ${errorMessage || message}\n`);
      }
    };
    
    return spinner;
  }

  /**
   * Display a progress summary
   */
  static displaySummary(stats) {
    console.log(chalk.bold('\nSummary:\n'));
    
    if (stats.completed > 0) {
      console.log(chalk.green(`✅ Completed: ${stats.completed}`));
    }
    if (stats.skipped > 0) {
      console.log(chalk.yellow(`⏭️  Skipped: ${stats.skipped}`));
    }
    if (stats.error > 0) {
      console.log(chalk.red(`❌ Errors: ${stats.error}`));
    }
    if (stats.warning > 0) {
      console.log(chalk.yellow(`⚠️  Warnings: ${stats.warning}`));
    }
    
    const successRate = Math.round((stats.completed / stats.total) * 100);
    console.log(chalk.gray(`\nSuccess rate: ${successRate}%`));
  }

  /**
   * Display conflict statistics
   */
  static displayConflictStats(stats) {
    console.log(chalk.bold('Conflict Summary:\n'));
    
    console.log(`Total files with conflicts: ${stats.totalFiles}`);
    console.log(`Total conflicts: ${stats.totalConflicts}\n`);
    
    if (Object.keys(stats.byType).length > 0) {
      console.log(chalk.bold('By type:'));
      Object.entries(stats.byType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    }
    
    if (stats.bySize && Object.keys(stats.bySize).length > 0) {
      console.log(chalk.bold('\nBy size:'));
      if (stats.bySize.small !== undefined) {
        console.log(`  Small (< 10 lines): ${stats.bySize.small}`);
      }
      if (stats.bySize.medium !== undefined) {
        console.log(`  Medium (10-50 lines): ${stats.bySize.medium}`);
      }
      if (stats.bySize.large !== undefined) {
        console.log(`  Large (> 50 lines): ${stats.bySize.large}`);
      }
    }
    
    console.log('');
  }

  /**
   * Get icon for conflict type
   */
  static getConflictTypeIcon(type) {
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
   * Display a step-by-step checklist
   */
  static createChecklist(title, items) {
    console.log(chalk.bold(`${title}:\n`));
    
    const checklist = {
      items: items.map(item => ({
        name: item,
        completed: false
      })),
      
      complete: (itemName) => {
        const item = checklist.items.find(i => i.name === itemName);
        if (item) {
          item.completed = true;
          checklist.render();
        }
      },
      
      render: () => {
        // Clear previous output if in TTY
        if (process.stdout.isTTY) {
          process.stdout.write('\x1B[' + (checklist.items.length + 2) + 'A');
        }
        
        console.log(chalk.bold(`${title}:\n`));
        checklist.items.forEach(item => {
          const icon = item.completed ? chalk.green('✅') : chalk.gray('☐');
          const text = item.completed ? chalk.gray(item.name) : item.name;
          console.log(`${icon} ${text}`);
        });
      }
    };
    
    checklist.render();
    return checklist;
  }

  /**
   * Create a multi-choice progress display
   */
  static createMultiProgress(title, tasks) {
    console.log(chalk.bold(`${title}\n`));
    
    const progress = {
      tasks: tasks,
      
      update: (taskName, value) => {
        const task = progress.tasks.find(t => t.name === taskName);
        if (task) {
          task.current = Math.min(value, task.total);
          task.status = task.current >= task.total ? 'completed' : 'in_progress';
          progress.render();
        }
      },
      
      render: () => {
        if (process.stdout.isTTY) {
          process.stdout.write('\x1B[' + (progress.tasks.length + 2) + 'A');
        }
        
        console.log(chalk.bold(`${title}\n`));
        
        progress.tasks.forEach(task => {
          const percent = Math.round((task.current / task.total) * 100);
          const barWidth = 20;
          const completed = Math.floor((percent / 100) * barWidth);
          const remaining = barWidth - completed;
          
          const bar = chalk.green('█'.repeat(completed)) + chalk.gray('░'.repeat(remaining));
          const icon = task.status === 'completed' ? '✅' : '🔄';
          
          console.log(`${icon} ${task.name}`);
          console.log(`   ${bar} ${percent}% (${task.current}/${task.total})\n`);
        });
      }
    };
    
    progress.render();
    return progress;
  }

  /**
   * Show merge options for a branch
   */
  static showMergeOptions(branch, hasConflicts) {
    console.log(chalk.bold(`\nMerge Options for ${branch}:\n`));
    
    if (hasConflicts) {
      console.log(chalk.yellow('⚠️  This branch has conflicts that need resolution\n'));
    }
    
    console.log('1. Regular merge - Preserves commit history');
    console.log('2. Squash merge - Combines all commits into one');
    console.log('3. Rebase merge - Reapplies commits on top of base branch');
  }

  /**
   * Display a tree structure for hierarchical progress
   */
  static createTreeProgress(title, tree) {
    console.log(chalk.bold(`${title}\n`));
    
    const treeProgress = {
      nodes: tree,
      
      updateNode: (path, status) => {
        const parts = path.split('/');
        let current = treeProgress.nodes;
        
        for (let i = 0; i < parts.length - 1; i++) {
          current = current.find(n => n.name === parts[i])?.children || [];
        }
        
        const node = current.find(n => n.name === parts[parts.length - 1]);
        if (node) {
          node.status = status;
          treeProgress.render();
        }
      },
      
      render: () => {
        if (process.stdout.isTTY) {
          const lineCount = treeProgress.countLines(treeProgress.nodes, 0);
          process.stdout.write('\x1B[' + (lineCount + 2) + 'A');
        }
        
        console.log(chalk.bold(`${title}\n`));
        treeProgress.renderNode(treeProgress.nodes, '', true);
      },
      
      renderNode: (nodes, prefix, _isLast) => {
        nodes.forEach((node, index) => {
          const isLastNode = index === nodes.length - 1;
          const icon = treeProgress.getStatusIcon(node.status);
          const connector = isLastNode ? '└─' : '├─';
          
          console.log(`${connector} ${icon} ${node.name}`);
          
          if (node.children && node.children.length > 0) {
            const newPrefix = prefix + (isLastNode ? '   ' : '│  ');
            treeProgress.renderNode(node.children, newPrefix, isLastNode);
          }
        });
      },
      
      getStatusIcon: (status) => {
        return {
          pending: '⏳',
          in_progress: '🔄',
          completed: '✅',
          error: '❌',
          skipped: '⏭️'
        }[status] || '📄';
      },
      
      countLines: (nodes, count) => {
        nodes.forEach(node => {
          count++;
          if (node.children) {
            count = treeProgress.countLines(node.children, count);
          }
        });
        return count;
      }
    };
    
    treeProgress.render();
    return treeProgress;
  }
}

module.exports = ProgressUI;