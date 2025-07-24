const MessageFormatter = require('../../../lib/merge-helper/message-formatter');

describe('MessageFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new MessageFormatter();
  });

  describe('identifyErrorPattern', () => {
    it('should identify uncommitted changes pattern', () => {
      const error = 'Your local changes to the following files would be overwritten by merge';
      const pattern = formatter.identifyErrorPattern(error);
      expect(pattern).toBe('uncommittedChanges');
    });

    it('should identify conflict markers pattern', () => {
      const error = 'Automatic merge failed; fix conflicts and then commit the result';
      const pattern = formatter.identifyErrorPattern(error);
      expect(pattern).toBe('conflictMarkers');
    });

    it('should identify translated conflict messages', () => {
      const error1 = 'There are conflicts in some files that need to be fixed manually';
      const pattern1 = formatter.identifyErrorPattern(error1);
      expect(pattern1).toBe('conflictMarkers');

      const error2 = 'There are merge conflicts. Fix the conflicts in your files, then commit the changes.';
      const pattern2 = formatter.identifyErrorPattern(error2);
      expect(pattern2).toBe('conflictMarkers');
    });

    it('should identify missing branch pattern', () => {
      const error = 'pathspec \'main\' did not match any file(s) known to git';
      const pattern = formatter.identifyErrorPattern(error);
      expect(pattern).toBe('missingBranch');
    });

    it('should identify diverged branches pattern', () => {
      const error = 'Your branch and \'origin/main\' have diverged, and have 2 and 3 different commits each';
      const pattern = formatter.identifyErrorPattern(error);
      expect(pattern).toBe('divergedBranches');
    });

    it('should return unknown for unmatched patterns', () => {
      const error = 'Some completely unknown error message';
      const pattern = formatter.identifyErrorPattern(error);
      expect(pattern).toBe('unknown');
    });

    it('should handle Error objects', () => {
      const error = new Error('would be overwritten by merge');
      const pattern = formatter.identifyErrorPattern(error);
      expect(pattern).toBe('uncommittedChanges');
    });
  });

  describe('formatError', () => {
    it('should format uncommitted changes error', () => {
      const error = 'would be overwritten by merge';
      const formatted = formatter.formatError(error);

      expect(formatted).toHaveProperty('title');
      expect(formatted).toHaveProperty('explanation');
      expect(formatted).toHaveProperty('options');
      expect(formatted.title).toBe('You have unsaved changes');
      expect(formatted.options).toHaveLength(3);
      expect(formatted.options[0].safe).toBe(true);
      expect(formatted.options[0].skill).toBe('beginner');
    });

    it('should format conflict markers error', () => {
      const error = 'Automatic merge failed; fix conflicts';
      const formatted = formatter.formatError(error);

      expect(formatted.title).toBe('Merge conflicts detected');
      expect(formatted.options.length).toBeGreaterThan(0);
    });

    it('should format translated conflict messages with proper resolution options', () => {
      const error = 'There are conflicts in some files that need to be fixed manually';
      const formatted = formatter.formatError(error);

      expect(formatted.title).toBe('Merge conflicts detected');
      expect(formatted.options.length).toBeGreaterThan(0);
      expect(formatted.helpAvailable).toContain('merge-conflicts');
    });

    it('should return default format for unknown errors', () => {
      const error = 'Unknown error message';
      const formatted = formatter.formatError(error);

      expect(formatted.title).toBe('Git operation failed');
      expect(formatted.explanation).toBe('An unexpected error occurred during the merge operation.');
      expect(formatted.rawError).toBe(error);
    });

    it('should contextualize messages with branch info', () => {
      const error = 'Your branch and origin/main have diverged';
      const context = { branch: 'feature-auth' };
      const formatted = formatter.formatError(error, context);

      expect(formatted.explanation).toContain('\'feature-auth\'');
    });

    it('should include file information in context', () => {
      const error = 'Automatic merge failed; fix conflicts';
      const context = { files: ['src/app.js', 'src/config.js', 'test/app.test.js', 'other.js'] };
      const formatted = formatter.formatError(error, context);

      expect(formatted.explanation).toContain('src/app.js, src/config.js, test/app.test.js (and 1 more)');
    });

    it('should replace main branch references in message and options', () => {
      const error = 'pathspec \'master\' did not match any file(s) known to git';
      const context = { mainBranch: 'master' };
      const formatted = formatter.formatError(error, context);

      expect(formatted.title).toBe('Target branch not found');
      
      // Check that options use the correct main branch
      const createOption = formatted.options.find(opt => opt.label === 'Create the branch first');
      expect(createOption.command).toBe('git checkout -b master');
      expect(createOption.wttCommand).toBe('wt create-branch master');
    });
  });

  describe('rankOptionsBySkillLevel', () => {
    const mockOptions = [
      { label: 'Advanced option', safe: false, skill: 'advanced' },
      { label: 'Beginner option', safe: true, skill: 'beginner' },
      { label: 'Intermediate option', safe: true, skill: 'intermediate' }
    ];

    it('should prioritize safe options', () => {
      const ranked = formatter.rankOptionsBySkillLevel(mockOptions, 'beginner');
      expect(ranked[0].safe).toBe(true);
      expect(ranked[1].safe).toBe(true);
      expect(ranked[2].safe).toBe(false);
    });

    it('should rank by skill level proximity for beginner', () => {
      const ranked = formatter.rankOptionsBySkillLevel(mockOptions, 'beginner');
      expect(ranked[0].skill).toBe('beginner');
      expect(ranked[1].skill).toBe('intermediate');
    });

    it('should rank by skill level proximity for advanced user', () => {
      const ranked = formatter.rankOptionsBySkillLevel(mockOptions, 'advanced');
      // Safe options still come first, but among safe options, intermediate is closer to advanced
      expect(ranked[0].skill).toBe('intermediate');
      expect(ranked[1].skill).toBe('beginner');
      expect(ranked[2].skill).toBe('advanced');
    });

    it('should default to beginner skill level', () => {
      const ranked = formatter.rankOptionsBySkillLevel(mockOptions);
      expect(ranked[0].skill).toBe('beginner');
    });
  });

  describe('displayFormattedError', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should display formatted error with title and explanation', () => {
      // Ensure enhanced mode for this test
      const originalErrorLevel = process.env.WTT_ERROR_LEVEL;
      process.env.WTT_ERROR_LEVEL = 'enhanced';
      
      try {
        const errorInfo = {
          title: 'Test Error',
          explanation: 'This is a test error',
          options: [{
            label: 'Test option',
            safe: true,
            skill: 'beginner',
            description: 'Test description',
            wttCommand: 'wt test'
          }]
        };

        formatter.displayFormattedError(errorInfo);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test Error'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('This is a test error'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test option'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('wt test'));
      } finally {
        process.env.WTT_ERROR_LEVEL = originalErrorLevel;
      }
    });

    it('should show raw error in verbose mode', () => {
      const originalErrorLevel = process.env.WTT_ERROR_LEVEL;
      process.env.WTT_ERROR_LEVEL = 'enhanced';
      
      try {
        const errorInfo = {
          title: 'Test Error',
          explanation: 'Test explanation',
          rawError: 'Original git error message',
          options: []
        };

        formatter.displayFormattedError(errorInfo, { verbose: true });

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Original git error message'));
      } finally {
        process.env.WTT_ERROR_LEVEL = originalErrorLevel;
      }
    });

    it('should display help topics', () => {
      const originalErrorLevel = process.env.WTT_ERROR_LEVEL;
      process.env.WTT_ERROR_LEVEL = 'enhanced';
      
      try {
        const errorInfo = {
          title: 'Test Error',
          explanation: 'Test explanation',
          options: [],
          helpAvailable: ['merge-conflicts', 'git-basics']
        };

        formatter.displayFormattedError(errorInfo);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('wt help merge-conflicts'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('wt help git-basics'));
      } finally {
        process.env.WTT_ERROR_LEVEL = originalErrorLevel;
      }
    });

    it('should display warning for unsafe options', () => {
      const originalErrorLevel = process.env.WTT_ERROR_LEVEL;
      process.env.WTT_ERROR_LEVEL = 'enhanced';
      
      try {
        const errorInfo = {
          title: 'Test Error',
          explanation: 'Test explanation',
          options: [{
            label: 'Dangerous option',
            safe: false,
            skill: 'advanced',
            description: 'This is dangerous',
            warning: 'This will delete everything'
          }]
        };

        formatter.displayFormattedError(errorInfo);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('This will delete everything'));
      } finally {
        process.env.WTT_ERROR_LEVEL = originalErrorLevel;
      }
    });
  });
});