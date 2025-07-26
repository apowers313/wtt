const ConflictResolver = require('../../../lib/merge-helper/conflict-resolver');
const chalk = require('chalk');

jest.mock('inquirer');
jest.mock('../../../lib/ui/conflict-ui');
jest.mock('../../../lib/merge-helper/conflict-detector');

describe('Whitespace Conflict Resolution', () => {
  let resolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
    jest.clearAllMocks();
  });

  describe('checkWhitespaceConflict', () => {
    it('should detect pure whitespace conflicts', () => {
      const conflict = {
        ours: ['  function test() {', '    return true;', '  }'],
        theirs: ['function test() {', '  return true;', '}']
      };

      const options = resolver.checkWhitespaceConflict(conflict);

      expect(options).toHaveLength(3);
      expect(options[0]).toMatchObject({
        label: 'Auto-resolve (use current branch formatting)',
        action: 'whitespace_ours',
        safe: true,
        skill: 'beginner'
      });
      expect(options[1]).toMatchObject({
        label: 'Auto-resolve (use incoming branch formatting)',
        action: 'whitespace_theirs',
        safe: true,
        skill: 'beginner'
      });
      expect(options[2]).toMatchObject({
        label: 'Auto-resolve (normalize whitespace)',
        action: 'whitespace_normalize',
        safe: true,
        skill: 'beginner'
      });
    });

    it('should detect trailing whitespace conflicts', () => {
      const conflict = {
        ours: ['const x = 5;  ', 'const y = 10;'],
        theirs: ['const x = 5;', 'const y = 10;']
      };

      const options = resolver.checkWhitespaceConflict(conflict);

      expect(options.some(opt => opt.action === 'remove_trailing_ws')).toBe(true);
      const removeWsOption = options.find(opt => opt.action === 'remove_trailing_ws');
      expect(removeWsOption.content).toBe('const x = 5;\nconst y = 10;');
    });

    it('should detect tab vs space conflicts', () => {
      const conflict = {
        ours: ['\tfunction test() {', '\t\treturn true;', '\t}'],
        theirs: ['  function test() {', '    return true;', '  }']
      };

      const options = resolver.checkWhitespaceConflict(conflict);

      expect(options.some(opt => opt.action === 'tabs_to_spaces')).toBe(true);
      expect(options.some(opt => opt.action === 'spaces_to_tabs')).toBe(true);
    });

    it('should handle mixed whitespace issues', () => {
      const conflict = {
        ours: ['\tconst x = 5;  ', '\tconst y = 10;'],
        theirs: ['  const x = 5;', '  const y = 10;']
      };

      const options = resolver.checkWhitespaceConflict(conflict);

      // Should offer both trailing whitespace removal and tab/space conversion
      expect(options.some(opt => opt.action === 'remove_trailing_ws')).toBe(true);
      expect(options.some(opt => opt.action === 'tabs_to_spaces')).toBe(true);
    });

    it('should return empty array for non-whitespace conflicts', () => {
      const conflict = {
        ours: ['const x = 5;'],
        theirs: ['const x = 10;']
      };

      const options = resolver.checkWhitespaceConflict(conflict);

      expect(options).toHaveLength(0);
    });
  });

  describe('normalizeWhitespace', () => {
    it('should remove trailing whitespace', () => {
      const lines = ['line1  ', 'line2\t', 'line3'];
      const result = resolver.normalizeWhitespace(lines);

      expect(result).toBe('line1\nline2\nline3');
    });
  });

  describe('hasTrailingWhitespaceDifference', () => {
    it('should detect trailing whitespace differences', () => {
      const conflict = {
        ours: ['line1  ', 'line2'],
        theirs: ['line1', 'line2']
      };

      expect(resolver.hasTrailingWhitespaceDifference(conflict)).toBe(true);
    });

    it('should return false when no trailing whitespace', () => {
      const conflict = {
        ours: ['line1', 'line2'],
        theirs: ['line1', 'line3']
      };

      expect(resolver.hasTrailingWhitespaceDifference(conflict)).toBe(false);
    });
  });

  describe('hasTabSpaceConflict', () => {
    it('should detect tab vs space conflicts', () => {
      const conflict = {
        ours: ['\tindented'],
        theirs: ['  indented']
      };

      expect(resolver.hasTabSpaceConflict(conflict)).toBe(true);
    });

    it('should return false when both use same indentation', () => {
      const conflict = {
        ours: ['  indented'],
        theirs: ['  indented']
      };

      expect(resolver.hasTabSpaceConflict(conflict)).toBe(false);
    });
  });

  describe('convertTabsToSpaces', () => {
    it('should convert tabs to 2 spaces', () => {
      const conflict = {
        ours: ['\tline1', '\t\tline2'],
        theirs: ['  line1', '    line2']
      };

      const result = resolver.convertTabsToSpaces(conflict);

      expect(result).toBe('  line1\n    line2');
    });
  });

  describe('convertSpacesToTabs', () => {
    it('should convert 2 spaces to tabs', () => {
      const conflict = {
        ours: ['  line1', '    line2'],
        theirs: ['\tline1', '\t\tline2']
      };

      const result = resolver.convertSpacesToTabs(conflict);

      expect(result).toBe('\tline1\n\t\tline2');
    });

    it('should handle odd number of spaces', () => {
      const conflict = {
        ours: ['   line1'], // 3 spaces
        theirs: ['\tline1']
      };

      const result = resolver.convertSpacesToTabs(conflict);

      // Should convert 2 spaces to 1 tab, leaving 1 space
      expect(result).toBe('\t line1');
    });
  });

  describe('generateSmartOptions integration', () => {
    it('should include whitespace options in smart options', () => {
      const conflict = {
        ours: ['  const x = 5;  '],
        theirs: ['const x = 5;']
      };

      const options = resolver.generateSmartOptions(conflict);

      // Should include whitespace resolution options
      expect(options.some(opt => opt.action.startsWith('whitespace_'))).toBe(true);
    });

    it('should prioritize whitespace options when applicable', () => {
      const conflict = {
        ours: ['  function test() {  '],
        theirs: ['function test() {']
      };

      const options = resolver.generateSmartOptions(conflict);

      // Whitespace options should come first
      expect(options[0].action).toMatch(/^whitespace_/);
    });
  });
});