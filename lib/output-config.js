/**
 * Output configuration system for controlling verbosity levels
 */

let globalVerbose = false;

class OutputConfig {
  /**
   * Set global verbose mode
   */
  static setVerbose(verbose) {
    globalVerbose = verbose;
  }

  /**
   * Check if verbose mode is enabled
   */
  static isVerbose() {
    return globalVerbose;
  }

  /**
   * Check if succinct mode is enabled (default)
   */
  static isSuccinct() {
    return !globalVerbose;
  }

  /**
   * Log only in verbose mode
   */
  static verboseLog(...args) {
    if (globalVerbose) {
      console.log(...args);
    }
  }

  /**
   * Log always (for important messages)
   */
  static log(...args) {
    console.log(...args);
  }

  /**
   * Log error always
   */
  static error(...args) {
    console.error(...args);
  }

  /**
   * Log warning always
   */
  static warn(...args) {
    console.warn(...args);
  }

  /**
   * Get appropriate progress renderer based on verbose setting
   */
  static getProgressRenderer() {
    return globalVerbose ? 'detailed' : 'simple';
  }

  /**
   * Should show detailed progress steps
   */
  static showDetailedProgress() {
    return globalVerbose;
  }

  /**
   * Should show help suggestions
   */
  static showHelpSuggestions() {
    return globalVerbose;
  }

  /**
   * Should show conflict details
   */
  static showConflictDetails() {
    return globalVerbose;
  }
}

module.exports = OutputConfig;