/**
 * Helper for capturing console output during tests
 */
class ConsoleCapture {
  constructor() {
    this.stdout = [];
    this.stderr = [];
    this.originalLog = null;
    this.originalError = null;
    this.originalWarn = null;
    this.isCapturing = false;
  }

  start() {
    if (this.isCapturing) {
      throw new Error('Console capture already started');
    }

    this.originalLog = console.log;
    this.originalError = console.error;
    this.originalWarn = console.warn;
    
    console.log = (...args) => {
      this.stdout.push(args.join(' '));
    };
    
    console.error = (...args) => {
      this.stderr.push(args.join(' '));
    };
    
    console.warn = (...args) => {
      this.stderr.push(args.join(' '));
    };
    
    this.isCapturing = true;
    return this;
  }

  stop() {
    if (!this.isCapturing) {
      throw new Error('Console capture not started');
    }

    console.log = this.originalLog;
    console.error = this.originalError;
    console.warn = this.originalWarn;
    
    this.isCapturing = false;
    
    return {
      stdout: this.stdout.join('\n'),
      stderr: this.stderr.join('\n'),
      lines: [...this.stdout, ...this.stderr],
      stdoutLines: [...this.stdout],
      stderrLines: [...this.stderr]
    };
  }

  getOutput() {
    return {
      stdout: this.stdout.join('\n'),
      stderr: this.stderr.join('\n'),
      lines: [...this.stdout, ...this.stderr],
      stdoutLines: [...this.stdout],
      stderrLines: [...this.stderr]
    };
  }

  clear() {
    this.stdout = [];
    this.stderr = [];
  }

  // Convenience method for use in tests
  static capture(fn) {
    const capture = new ConsoleCapture();
    capture.start();
    try {
      const result = fn();
      // Handle both sync and async functions
      if (result && typeof result.then === 'function') {
        return result.finally(() => capture.stop());
      }
      return capture.stop();
    } catch (error) {
      capture.stop();
      throw error;
    }
  }

  // Jest-friendly capture that returns both result and output
  static async captureAsync(fn) {
    const capture = new ConsoleCapture();
    capture.start();
    try {
      const result = await fn();
      const output = capture.stop();
      return { result, output };
    } catch (error) {
      const output = capture.stop();
      return { error, output };
    }
  }
}

module.exports = ConsoleCapture;