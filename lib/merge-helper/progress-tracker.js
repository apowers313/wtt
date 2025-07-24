const chalk = require('chalk');

class ProgressTracker {
  constructor(total) {
    this.total = total;
    this.current = 0;
    this.files = [];
    this.startTime = null;
    this.title = '';
    this.isCompleted = false;
  }

  /**
   * Start tracking progress
   */
  start(title = 'Progress') {
    this.title = title;
    this.startTime = Date.now();
    this.render();
  }

  /**
   * Update the status of a file
   */
  update(file, status) {
    // Update existing file or add new one
    const existingIndex = this.files.findIndex(f => f.file === file);
    
    if (existingIndex >= 0) {
      this.files[existingIndex].status = status;
      this.files[existingIndex].timestamp = Date.now();
    } else {
      this.files.push({ file, status, timestamp: Date.now() });
    }

    if (status === 'completed') {
      this.current++;
    }
    
    this.render();
  }

  /**
   * Mark progress as complete
   */
  complete() {
    this.isCompleted = true;
    this.render();
    
    const duration = Date.now() - this.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    
    console.log(chalk.green(`\n✅ ${this.title} completed in ${minutes}m ${seconds}s`));
  }

  /**
   * Render the progress display
   */
  render() {
    // Don't clear screen in non-TTY environments (like CI)
    if (process.stdout.isTTY) {
      // Move cursor to top of progress display
      process.stdout.write('\x1B[2J\x1B[H');
    }
    
    console.log(chalk.bold(`${this.title}\n`));
    
    // Progress bar
    const percent = Math.round((this.current / this.total) * 100);
    const barWidth = 30;
    const completed = Math.floor((percent / 100) * barWidth);
    const remaining = barWidth - completed;
    
    const progressBar = chalk.green('█'.repeat(completed)) + chalk.gray('░'.repeat(remaining));
    console.log(`${progressBar} ${percent}%`);
    console.log(chalk.gray(`${this.current}/${this.total} files\n`));
    
    // File list with status
    this.renderFileList();
    
    // Summary line
    if (!this.isCompleted && this.startTime) {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      console.log(chalk.gray(`\nElapsed: ${elapsed}s`));
    }
  }

  /**
   * Render the list of files with their status
   */
  renderFileList() {
    const maxFiles = 10; // Show last 10 files
    const startIndex = Math.max(0, this.files.length - maxFiles);
    const displayFiles = this.files.slice(startIndex);
    
    displayFiles.forEach(file => {
      const icon = this.getStatusIcon(file.status);
      const color = this.getStatusColor(file.status);
      console.log(color(`${icon} ${file.file}`));
    });
    
    if (this.files.length > maxFiles) {
      console.log(chalk.gray(`  ... and ${this.files.length - maxFiles} more`));
    }
  }

  /**
   * Get icon for status
   */
  getStatusIcon(status) {
    const icons = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      error: '❌',
      skipped: '⏭️',
      warning: '⚠️'
    };
    return icons[status] || '❓';
  }

  /**
   * Get color function for status
   */
  getStatusColor(status) {
    const colors = {
      pending: chalk.gray,
      in_progress: chalk.blue,
      completed: chalk.green,
      error: chalk.red,
      skipped: chalk.yellow,
      warning: chalk.yellow
    };
    return colors[status] || chalk.white;
  }

  /**
   * Add a warning message
   */
  addWarning(message) {
    console.log(chalk.yellow(`\n⚠️  ${message}`));
  }

  /**
   * Add an error message
   */
  addError(message) {
    console.log(chalk.red(`\n❌ ${message}`));
  }

  /**
   * Get current statistics
   */
  getStats() {
    const stats = {
      total: this.total,
      completed: this.current,
      pending: 0,
      in_progress: 0,
      error: 0,
      skipped: 0
    };

    this.files.forEach(file => {
      if (stats[file.status] !== undefined) {
        stats[file.status]++;
      }
    });

    stats.pending = this.total - this.files.length + stats.pending;
    
    return stats;
  }

  /**
   * Create a simple progress bar without clearing screen
   */
  static createSimple(total) {
    let current = 0;
    
    return {
      update: (increment = 1) => {
        current += increment;
        const percent = Math.round((current / total) * 100);
        const dots = '.'.repeat(Math.floor(percent / 10));
        process.stdout.write(`\r[${dots.padEnd(10)}] ${percent}%`);
        
        if (current >= total) {
          process.stdout.write('\n');
        }
      },
      complete: () => {
        process.stdout.write('\n');
      }
    };
  }
}

/**
 * Create a section progress tracker for multi-step operations
 */
class SectionProgressTracker {
  constructor(sections) {
    this.sections = sections.map((section, index) => ({
      name: section,
      status: 'pending',
      index: index + 1
    }));
    this.currentSection = 0;
  }

  /**
   * Start a section
   */
  startSection(sectionName) {
    const section = this.sections.find(s => s.name === sectionName);
    if (section) {
      section.status = 'in_progress';
      this.currentSection = section.index;
      this.render();
    }
  }

  /**
   * Complete a section
   */
  completeSection(sectionName) {
    const section = this.sections.find(s => s.name === sectionName);
    if (section) {
      section.status = 'completed';
      this.render();
    }
  }

  /**
   * Update a section by index
   */
  updateSection(index, status) {
    if (index >= 0 && index < this.sections.length) {
      this.sections[index].status = status;
      if (status === 'in_progress') {
        this.currentSection = index + 1;
      }
      this.render();
    }
  }

  /**
   * Mark all sections as complete
   */
  complete() {
    this.sections.forEach(section => {
      section.status = 'completed';
    });
    this.render();
    console.log(chalk.green('\n✅ All steps completed successfully'));
  }

  /**
   * Mark as failed
   */
  fail() {
    if (this.currentSection > 0 && this.currentSection <= this.sections.length) {
      this.sections[this.currentSection - 1].status = 'error';
    }
    this.render();
  }

  /**
   * Render section progress
   */
  render() {
    console.log(chalk.bold('\nProgress:\n'));
    
    this.sections.forEach(section => {
      const icon = this.getIcon(section.status);
      const color = this.getColor(section.status);
      console.log(color(`Step ${section.index}/${this.sections.length}: ${section.name} ${icon}`));
    });
    
    console.log('');
  }

  getIcon(status) {
    return {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      error: '❌'
    }[status] || '';
  }

  getColor(status) {
    return {
      pending: chalk.gray,
      in_progress: chalk.blue,
      completed: chalk.green,
      error: chalk.red
    }[status] || chalk.white;
  }
}

module.exports = ProgressTracker;
module.exports.SectionProgressTracker = SectionProgressTracker;