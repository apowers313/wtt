const chalk = require('chalk');

/**
 * Centralized output system for consistent, concise command feedback
 * 
 * Design principles:
 * - Every command output should be 1-3 lines maximum unless verbose flag is used
 * - Use consistent prefix pattern: "wt <command>: <message>"
 * - Separate success, error, info, and status message types
 * - Provide verbose mode for detailed output
 */
class Output {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.quiet = options.quiet || false;
    this.prefix = 'wt';
  }

  /**
   * Display success message (always shown unless quiet)
   */
  success(command, message) {
    if (!this.quiet) {
      console.log(`${this.prefix} ${command}: ${message}`);
    }
  }

  /**
   * Display error message (always shown)
   */
  error(command, message, details = null) {
    console.error(`${this.prefix} ${command}: error: ${message}`);
    if (details && this.verbose) {
      console.error(`  ${details}`);
    }
  }

  /**
   * Display info message (only in verbose mode)
   */
  info(command, message) {
    if (!this.quiet && this.verbose) {
      console.log(`${this.prefix} ${command}: ${message}`);
    }
  }

  /**
   * Display status message for ongoing operations
   */
  status(command, action, target) {
    if (!this.quiet) {
      console.log(`${this.prefix} ${command}: ${action} ${target}`);
    }
  }

  /**
   * Display warning message
   */
  warning(command, message) {
    if (!this.quiet) {
      console.log(chalk.yellow(`${this.prefix} ${command}: warning: ${message}`));
    }
  }

  /**
   * Display colored success message
   */
  successColored(command, message) {
    if (!this.quiet) {
      console.log(chalk.green(`${this.prefix} ${command}: ${message}`));
    }
  }

  /**
   * Display colored error message
   */
  errorColored(command, message, details = null) {
    console.error(chalk.red(`${this.prefix} ${command}: error: ${message}`));
    if (details && this.verbose) {
      console.error(chalk.gray(`  ${details}`));
    }
  }

  /**
   * Display verbose-only message with indentation
   */
  verboseStep(command, step) {
    if (!this.quiet && this.verbose) {
      console.log(`${this.prefix} ${command}: ${step}`);
    }
  }

  /**
   * Display raw message (bypass formatting)
   */
  raw(message) {
    if (!this.quiet) {
      console.log(message);
    }
  }

  /**
   * Display exit code information for debugging
   */
  exitInfo(command, code, reason = null) {
    if (this.verbose) {
      const message = reason ? `exiting with code ${code}: ${reason}` : `exiting with code ${code}`;
      console.error(chalk.gray(`${this.prefix} ${command}: ${message}`));
    }
  }
}

module.exports = Output;