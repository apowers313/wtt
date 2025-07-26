const OutputConfig = require('../../../lib/output-config');

describe('OutputConfig', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    // Reset global state
    OutputConfig.setVerbose(false);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('setVerbose and isVerbose', () => {
    it('should set and get verbose mode', () => {
      expect(OutputConfig.isVerbose()).toBe(false);
      
      OutputConfig.setVerbose(true);
      expect(OutputConfig.isVerbose()).toBe(true);
      
      OutputConfig.setVerbose(false);
      expect(OutputConfig.isVerbose()).toBe(false);
    });
  });

  describe('isSuccinct', () => {
    it('should return opposite of verbose mode', () => {
      OutputConfig.setVerbose(false);
      expect(OutputConfig.isSuccinct()).toBe(true);
      
      OutputConfig.setVerbose(true);
      expect(OutputConfig.isSuccinct()).toBe(false);
    });
  });

  describe('verboseLog', () => {
    it('should log only when verbose mode is enabled', () => {
      OutputConfig.setVerbose(false);
      OutputConfig.verboseLog('Hidden message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      
      OutputConfig.setVerbose(true);
      OutputConfig.verboseLog('Visible message');
      expect(consoleLogSpy).toHaveBeenCalledWith('Visible message');
    });

    it('should handle multiple arguments', () => {
      OutputConfig.setVerbose(true);
      OutputConfig.verboseLog('Message', 'with', 'args');
      expect(consoleLogSpy).toHaveBeenCalledWith('Message', 'with', 'args');
    });

    it('should not log multiple arguments when verbose is off', () => {
      OutputConfig.setVerbose(false);
      OutputConfig.verboseLog('Message', 'with', 'args');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('log', () => {
    it('should always log messages', () => {
      OutputConfig.setVerbose(false);
      OutputConfig.log('Always visible');
      expect(consoleLogSpy).toHaveBeenCalledWith('Always visible');
      
      OutputConfig.setVerbose(true);
      OutputConfig.log('Still visible');
      expect(consoleLogSpy).toHaveBeenCalledWith('Still visible');
    });

    it('should handle multiple arguments', () => {
      OutputConfig.log('Multiple', 'arguments', 'test');
      expect(consoleLogSpy).toHaveBeenCalledWith('Multiple', 'arguments', 'test');
    });
  });

  describe('error', () => {
    it('should always log errors', () => {
      OutputConfig.setVerbose(false);
      OutputConfig.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error message');
      
      OutputConfig.setVerbose(true);
      OutputConfig.error('Another error');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Another error');
    });

    it('should handle multiple arguments', () => {
      OutputConfig.error('Error:', 'Something went wrong');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', 'Something went wrong');
    });
  });

  describe('warn', () => {
    it('should always log warnings', () => {
      OutputConfig.setVerbose(false);
      OutputConfig.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Warning message');
      
      OutputConfig.setVerbose(true);
      OutputConfig.warn('Another warning');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Another warning');
    });

    it('should handle multiple arguments', () => {
      OutputConfig.warn('Warning:', 'Something suspicious');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Warning:', 'Something suspicious');
    });
  });

  describe('getProgressRenderer', () => {
    it('should return appropriate renderer based on verbose setting', () => {
      OutputConfig.setVerbose(false);
      expect(OutputConfig.getProgressRenderer()).toBe('simple');
      
      OutputConfig.setVerbose(true);
      expect(OutputConfig.getProgressRenderer()).toBe('detailed');
    });
  });

  describe('showDetailedProgress', () => {
    it('should return verbose setting', () => {
      OutputConfig.setVerbose(false);
      expect(OutputConfig.showDetailedProgress()).toBe(false);
      
      OutputConfig.setVerbose(true);
      expect(OutputConfig.showDetailedProgress()).toBe(true);
    });
  });

  describe('showHelpSuggestions', () => {
    it('should return verbose setting', () => {
      OutputConfig.setVerbose(false);
      expect(OutputConfig.showHelpSuggestions()).toBe(false);
      
      OutputConfig.setVerbose(true);
      expect(OutputConfig.showHelpSuggestions()).toBe(true);
    });
  });

  describe('showConflictDetails', () => {
    it('should return verbose setting', () => {
      OutputConfig.setVerbose(false);
      expect(OutputConfig.showConflictDetails()).toBe(false);
      
      OutputConfig.setVerbose(true);
      expect(OutputConfig.showConflictDetails()).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    it('should handle switching between verbose modes', () => {
      // Start in succinct mode
      OutputConfig.setVerbose(false);
      OutputConfig.verboseLog('Should not appear');
      OutputConfig.log('Should appear');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith('Should appear');
      
      // Switch to verbose mode
      OutputConfig.setVerbose(true);
      OutputConfig.verboseLog('Now should appear');
      OutputConfig.log('Still should appear');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, 'Now should appear');
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, 'Still should appear');
    });

    it('should maintain state across multiple calls', () => {
      OutputConfig.setVerbose(true);
      
      expect(OutputConfig.isVerbose()).toBe(true);
      expect(OutputConfig.isSuccinct()).toBe(false);
      expect(OutputConfig.showDetailedProgress()).toBe(true);
      expect(OutputConfig.showHelpSuggestions()).toBe(true);
      expect(OutputConfig.showConflictDetails()).toBe(true);
      expect(OutputConfig.getProgressRenderer()).toBe('detailed');
    });

    it('should handle rapid mode switching', () => {
      for (let i = 0; i < 5; i++) {
        OutputConfig.setVerbose(i % 2 === 0);
        expect(OutputConfig.isVerbose()).toBe(i % 2 === 0);
        expect(OutputConfig.isSuccinct()).toBe(i % 2 !== 0);
      }
    });
  });

  describe('static method consistency', () => {
    it('should have all methods as static', () => {
      expect(typeof OutputConfig.setVerbose).toBe('function');
      expect(typeof OutputConfig.isVerbose).toBe('function');
      expect(typeof OutputConfig.isSuccinct).toBe('function');
      expect(typeof OutputConfig.verboseLog).toBe('function');
      expect(typeof OutputConfig.log).toBe('function');
      expect(typeof OutputConfig.error).toBe('function');
      expect(typeof OutputConfig.warn).toBe('function');
      expect(typeof OutputConfig.getProgressRenderer).toBe('function');
      expect(typeof OutputConfig.showDetailedProgress).toBe('function');
      expect(typeof OutputConfig.showHelpSuggestions).toBe('function');
      expect(typeof OutputConfig.showConflictDetails).toBe('function');
    });

    it('should not require instantiation', () => {
      // All methods should work without creating an instance
      OutputConfig.setVerbose(true);
      OutputConfig.log('Test message');
      
      expect(consoleLogSpy).toHaveBeenCalledWith('Test message');
    });
  });
});