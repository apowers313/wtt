/**
 * Console Capture Helper for WTT Tests
 * Captures console output during test execution for assertions
 */

class ConsoleCapture {
  constructor() {
    this.stdout = [];
    this.stderr = [];
    this.originalLog = null;
    this.originalError = null;
    this.originalWarn = null;
    this.originalInfo = null;
    this.isCapturing = false;
  }

  /**
   * Start capturing console output
   */
  start() {
    if (this.isCapturing) {
      throw new Error('Console capture is already active');
    }

    // Store original methods
    this.originalLog = console.log;
    this.originalError = console.error;
    this.originalWarn = console.warn;
    this.originalInfo = console.info;

    // Override console methods
    console.log = (...args) => {
      this.stdout.push(this._formatArgs(args));
    };

    console.error = (...args) => {
      this.stderr.push(this._formatArgs(args));
    };

    console.warn = (...args) => {
      this.stderr.push(this._formatArgs(args));
    };

    console.info = (...args) => {
      this.stdout.push(this._formatArgs(args));
    };

    this.isCapturing = true;
    return this;
  }

  /**
   * Stop capturing and restore original console methods
   */
  stop() {
    if (!this.isCapturing) {
      throw new Error('Console capture is not active');
    }

    // Restore original methods
    console.log = this.originalLog;
    console.error = this.originalError;
    console.warn = this.originalWarn;
    console.info = this.originalInfo;

    this.isCapturing = false;

    return {
      stdout: this.stdout.join('\n'),
      stderr: this.stderr.join('\n'),
      lines: [...this.stdout, ...this.stderr],
      stdoutLines: [...this.stdout],
      stderrLines: [...this.stderr]
    };
  }

  /**
   * Get current captured output without stopping
   */
  getOutput() {
    return {
      stdout: this.stdout.join('\n'),
      stderr: this.stderr.join('\n'),
      lines: [...this.stdout, ...this.stderr],
      stdoutLines: [...this.stdout],
      stderrLines: [...this.stderr]
    };
  }

  /**
   * Clear captured output without stopping capture
   */
  clear() {
    this.stdout = [];
    this.stderr = [];
  }

  /**
   * Capture output for a specific function execution
   */
  static async capture(fn) {
    const capture = new ConsoleCapture();
    capture.start();
    
    try {
      const result = await fn();
      const output = capture.stop();
      
      return {
        result,
        output: output.stdout + output.stderr,
        stdout: output.stdout,
        stderr: output.stderr,
        lines: output.lines
      };
    } catch (error) {
      const output = capture.stop();
      
      return {
        error,
        output: output.stdout + output.stderr,
        stdout: output.stdout,
        stderr: output.stderr,
        lines: output.lines
      };
    }
  }

  /**
   * Capture output synchronously
   */
  static captureSync(fn) {
    const capture = new ConsoleCapture();
    capture.start();
    
    try {
      const result = fn();
      const output = capture.stop();
      
      return {
        result,
        output: output.stdout + output.stderr,
        stdout: output.stdout,
        stderr: output.stderr,
        lines: output.lines
      };
    } catch (error) {
      const output = capture.stop();
      
      return {
        error,
        output: output.stdout + output.stderr,
        stdout: output.stdout,
        stderr: output.stderr,
        lines: output.lines
      };
    }
  }

  /**
   * Format console arguments to string
   */
  _formatArgs(args) {
    return args.map(arg => {
      if (typeof arg === 'string') {
        return arg;
      } else if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      } else {
        return String(arg);
      }
    }).join(' ');
  }

  /**
   * Helper for testing Output module specifically
   */
  static async captureOutputModule(outputInstance, operation) {
    const capture = new ConsoleCapture();
    capture.start();
    
    try {
      await operation(outputInstance);
      const output = capture.stop();
      
      return {
        success: true,
        output: output.stdout + output.stderr,
        stdout: output.stdout,
        stderr: output.stderr,
        lines: output.lines
      };
    } catch (error) {
      const output = capture.stop();
      
      return {
        success: false,
        error,
        output: output.stdout + output.stderr,
        stdout: output.stdout,
        stderr: output.stderr,
        lines: output.lines
      };
    }
  }

  /**
   * Assert captured output contains specific text
   */
  assertContains(text) {
    const output = this.getOutput();
    const fullOutput = output.stdout + output.stderr;
    
    if (!fullOutput.includes(text)) {
      throw new Error(`Expected output to contain "${text}" but got:\n${fullOutput}`);
    }
  }

  /**
   * Assert captured output matches pattern
   */
  assertMatches(pattern) {
    const output = this.getOutput();
    const fullOutput = output.stdout + output.stderr;
    
    if (!pattern.test(fullOutput)) {
      throw new Error(`Expected output to match ${pattern} but got:\n${fullOutput}`);
    }
  }

  /**
   * Assert no error output
   */
  assertNoErrors() {
    if (this.stderr.length > 0) {
      throw new Error(`Expected no error output but got:\n${this.stderr.join('\n')}`);
    }
  }

  /**
   * Assert specific line count
   */
  assertLineCount(expectedCount) {
    const totalLines = this.stdout.length + this.stderr.length;
    
    if (totalLines !== expectedCount) {
      throw new Error(`Expected ${expectedCount} lines but got ${totalLines}`);
    }
  }

  /**
   * Get the last N lines of output
   */
  getLastLines(n) {
    const allLines = [...this.stdout, ...this.stderr];
    return allLines.slice(-n);
  }

  /**
   * Check if output is concise (for WTT improvement testing)
   */
  isConcise(maxLines = 3) {
    const totalLines = this.stdout.length + this.stderr.length;
    return totalLines <= maxLines;
  }
}

module.exports = ConsoleCapture;