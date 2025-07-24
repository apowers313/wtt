const ConflictUI = require('../../../lib/ui/conflict-ui');
const inquirer = require('inquirer');

// Mock inquirer
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
  Separator: jest.fn().mockImplementation(() => ({ type: 'separator' }))
}));

describe('ConflictUI', () => {
  let conflictUI;
  let consoleSpy;

  beforeEach(() => {
    conflictUI = new ConflictUI();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'clear').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('showConflict', () => {
    const mockConflict = {
      file: 'src/app.js',
      lineNumber: 42,
      yourVersion: 'const timeout = 5000;',
      theirVersion: 'const timeout = 3000;',
      context: {
        before: ['function calculate() {'],
        after: ['  return result;', '}']
      }
    };

    it('should display conflict information', async () => {
      await conflictUI.showConflict(mockConflict);

      expect(console.clear).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('CONFLICT in src/app.js'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Line 42'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('YOUR VERSION'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('TEAM\'S VERSION'));
    });

    it('should display context when available', async () => {
      await conflictUI.showConflict(mockConflict);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Context before'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('function calculate() {'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Context after'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('return result;'));
    });

    it('should handle conflicts without line numbers', async () => {
      const conflictWithoutLine = { ...mockConflict, lineNumber: undefined };
      await conflictUI.showConflict(conflictWithoutLine);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Line unknown'));
    });

    it('should handle multiline conflicts', async () => {
      const multilineConflict = {
        ...mockConflict,
        yourVersion: 'function foo() {\n  return "yours";\n}',
        theirVersion: 'function foo() {\n  return "theirs";\n}'
      };
      
      await conflictUI.showConflict(multilineConflict);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('function foo() {'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('return "yours";'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('return "theirs";'));
    });

    it('should store current conflict for later use', async () => {
      await conflictUI.showConflict(mockConflict);
      expect(conflictUI.currentConflict).toEqual(mockConflict);
    });
  });

  describe('promptForChoice', () => {
    const mockOptions = [
      {
        label: 'Keep your version',
        action: 'ours',
        safe: true,
        skill: 'beginner',
        description: 'Use your changes'
      },
      {
        label: 'Keep their version',
        action: 'theirs',
        safe: true,
        skill: 'beginner',
        description: 'Use their changes'
      },
      {
        label: 'Edit manually',
        action: 'edit',
        safe: true,
        skill: 'intermediate',
        description: 'Combine or modify both versions'
      }
    ];

    it('should present options with safety and skill indicators', async () => {
      inquirer.prompt.mockResolvedValue({ choice: 0 });
      
      await conflictUI.promptForChoice(mockOptions);
      
      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'list',
        name: 'choice',
        message: 'What would you like to do?',
        choices: expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringContaining('Keep your version'),
            value: 0,
            short: 'Keep your version'
          })
        ]),
        pageSize: 15
      }]);
    });

    it('should return selected option', async () => {
      inquirer.prompt.mockResolvedValue({ choice: 1 });
      
      const result = await conflictUI.promptForChoice(mockOptions);
      
      expect(result).toEqual(mockOptions[1]);
    });

    it('should use default options when none provided', async () => {
      inquirer.prompt.mockResolvedValue({ choice: 0 });
      
      const result = await conflictUI.promptForChoice();
      
      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('action');
      expect(inquirer.prompt).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          choices: expect.arrayContaining([
            expect.objectContaining({
              name: expect.stringContaining('Keep your version')
            })
          ])
        })
      ]));
    });

    it('should include special action choices', async () => {
      inquirer.prompt.mockResolvedValue({ choice: 0 });
      
      await conflictUI.promptForChoice(mockOptions);
      
      const call = inquirer.prompt.mock.calls[0][0][0];
      const choices = call.choices.map(c => c.value || c.constructor.name);
      
      expect(choices).toContain('more-context');
      expect(choices).toContain('help');
      expect(choices).toContain('panic');
    });

    it('should handle more-context choice', async () => {
      conflictUI.currentConflict = {
        file: 'test.js',
        yourVersion: 'test',
        theirVersion: 'test2'
      };
      
      inquirer.prompt
        .mockResolvedValueOnce({ choice: 'more-context' })
        .mockResolvedValueOnce({ continue: '' }) // For showMoreContext
        .mockResolvedValueOnce({ choice: 0 }); // Final choice
      
      const result = await conflictUI.promptForChoice(mockOptions);
      
      expect(inquirer.prompt).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockOptions[0]);
    });

    it('should handle help choice', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ choice: 'help' })
        .mockResolvedValueOnce({ continue: '' }) // For showConflictHelp
        .mockResolvedValueOnce({ choice: 0 }); // Final choice
      
      const result = await conflictUI.promptForChoice(mockOptions);
      
      expect(inquirer.prompt).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockOptions[0]);
    });

    it('should handle panic choice', async () => {
      inquirer.prompt.mockResolvedValue({ choice: 'panic' });
      
      const result = await conflictUI.promptForChoice(mockOptions);
      
      expect(result).toEqual({ action: 'panic' });
    });
  });

  describe('getConflictType', () => {
    it('should identify function definition conflicts', () => {
      const conflict = {
        yourVersion: 'function calculate(x, y) {',
        theirVersion: 'function calculate(x, y, z) {'
      };
      
      const type = conflictUI.getConflictType(conflict);
      expect(type).toBe('function-definition');
    });

    it('should identify import statement conflicts', () => {
      const conflict = {
        yourVersion: 'import { foo } from "./foo";',
        theirVersion: 'import { foo, bar } from "./foo";'
      };
      
      const type = conflictUI.getConflictType(conflict);
      expect(type).toBe('import-statement');
    });

    it('should identify variable assignment conflicts', () => {
      const conflict = {
        yourVersion: 'const timeout = 5000;',
        theirVersion: 'const timeout = 3000;'
      };
      
      const type = conflictUI.getConflictType(conflict);
      expect(type).toBe('variable-assignment');
    });

    it('should identify comment conflicts', () => {
      const conflict = {
        yourVersion: '// Your comment',
        theirVersion: '// Their comment'
      };
      
      const type = conflictUI.getConflictType(conflict);
      expect(type).toBe('comment-conflict');
    });

    it('should default to code-change for unknown types', () => {
      const conflict = {
        yourVersion: 'some code',
        theirVersion: 'other code'
      };
      
      const type = conflictUI.getConflictType(conflict);
      expect(type).toBe('code-change');
    });

    it('should handle null conflict', () => {
      const type = conflictUI.getConflictType(null);
      expect(type).toBe('unknown');
    });
  });

  describe('displayProgress', () => {
    it('should display progress information', () => {
      conflictUI.displayProgress(3, 5, 'src/app.js');
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Conflict Resolution Progress'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('60% complete'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Resolving conflict 3 of 5'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('src/app.js'));
    });

    it('should work without filename', () => {
      conflictUI.displayProgress(1, 3);
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('33% complete'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Resolving conflict 1 of 3'));
    });
  });

  describe('displaySummary', () => {
    it('should display completion summary', () => {
      conflictUI.displaySummary(5, 5, 30000);
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Conflict Resolution Complete!'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Resolved 5 of 5 conflicts'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Time taken: 30s'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Next steps:'));
    });

    it('should work without time information', () => {
      conflictUI.displaySummary(3, 4);
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Resolved 3 of 4 conflicts'));
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Time taken'));
    });
  });

  describe('confirmResolution', () => {
    const mockConflict = { file: 'src/app.js' };
    
    it('should confirm basic resolution', async () => {
      const resolution = { label: 'Keep your version', action: 'ours' };
      inquirer.prompt.mockResolvedValue({ proceed: true });
      
      const result = await conflictUI.confirmResolution(mockConflict, resolution);
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Conflict Resolution Summary'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('src/app.js'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Keep your version'));
      expect(result).toBe(true);
    });

    it('should show special message for edit action', async () => {
      const resolution = { label: 'Edit manually', action: 'edit' };
      inquirer.prompt.mockResolvedValue({ proceed: true });
      
      await conflictUI.confirmResolution(mockConflict, resolution);
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('edit manually'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('opened in your default editor'));
    });

    it('should show special message for both action', async () => {
      const resolution = { label: 'Keep both', action: 'both' };
      inquirer.prompt.mockResolvedValue({ proceed: true });
      
      await conflictUI.confirmResolution(mockConflict, resolution);
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('keep both versions'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('clean up the duplicate code'));
    });

    it('should return false when user declines', async () => {
      const resolution = { label: 'Test', action: 'test' };
      inquirer.prompt.mockResolvedValue({ proceed: false });
      
      const result = await conflictUI.confirmResolution(mockConflict, resolution);
      
      expect(result).toBe(false);
    });
  });

  describe('showMoreContext', () => {
    it('should display extended context when available', async () => {
      conflictUI.currentConflict = {
        file: 'src/test.js',
        lineNumber: 10,
        yourVersion: 'const x = 1;',
        theirVersion: 'const x = 2;',
        extendedContext: {
          before: ['line 1', 'line 2', 'line 3'],
          after: ['line 16', 'line 17', 'line 18']
        }
      };
      inquirer.prompt.mockResolvedValue({ continue: '' });
      
      await conflictUI.showMoreContext();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Extended Context'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('src/test.js'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('line 1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('line 16'));
    });

    it('should handle missing current conflict', async () => {
      conflictUI.currentConflict = null;
      
      await conflictUI.showMoreContext();
      
      // Should return early without calling inquirer
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });
  });

  describe('showConflictHelp', () => {
    it('should display general conflict help', async () => {
      conflictUI.currentConflict = { yourVersion: 'test', theirVersion: 'test2' };
      inquirer.prompt.mockResolvedValue({ continue: '' });
      
      await conflictUI.showConflictHelp();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Conflict Resolution Help'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('What are merge conflicts?'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('How to resolve them:'));
    });

    it('should display specific help for conflict types', async () => {
      conflictUI.currentConflict = {
        yourVersion: 'function test() {',
        theirVersion: 'function test(param) {'
      };
      inquirer.prompt.mockResolvedValue({ continue: '' });
      
      await conflictUI.showConflictHelp();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('function-definition conflicts'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Function conflicts often need both changes'));
    });
  });
});