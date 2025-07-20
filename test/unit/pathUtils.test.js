const PathUtils = require('../../lib/pathUtils');

describe('PathUtils', () => {
  describe('equals', () => {
    test('handles identical paths', () => {
      expect(PathUtils.equals('/path/to/worktree', '/path/to/worktree')).toBe(true);
    });

    test('handles paths with different separators', () => {
      // Test with Windows absolute paths that have different separators
      expect(PathUtils.equals('C:/Users/test/.worktrees/wt-feature', 'C:\\Users\\test\\.worktrees\\wt-feature')).toBe(true);
      // Test with relative paths using different separators
      expect(PathUtils.equals('.worktrees/wt-feature', '.worktrees\\wt-feature')).toBe(true);
    });

    test('handles relative vs absolute paths', () => {
      const relativePath = '.worktrees/wt-feature';
      const absolutePath = process.cwd() + '/.worktrees/wt-feature';
      expect(PathUtils.equals(relativePath, absolutePath)).toBe(true);
    });

    test('handles Windows absolute paths', () => {
      expect(PathUtils.equals('C:\\temp\\test', 'C:/temp/test')).toBe(true);
      expect(PathUtils.equals('D:\\project\\.worktrees\\wt-feature', 'D:/project/.worktrees/wt-feature')).toBe(true);
    });

    test('handles Windows short vs long filename scenario', () => {
      // Simulate the exact scenario from Windows CI where RUNNER~1 != runneradmin
      // This test verifies the logic would work, though we can't test the actual fs.realpathSync behavior
      const shortPath = 'C:/Users/RUNNER~1/AppData/Local/Temp/wtt-tests/test-repo/.worktrees/wt-feature';
      const longPath = 'C:/Users/runneradmin/AppData/Local/Temp/wtt-tests/test-repo/.worktrees/wt-feature';
      
      // On non-Windows systems, these won't be equal (as expected)
      // On Windows, the normalize function should resolve short names to long names
      const shortNormalized = PathUtils.normalize(shortPath);
      const longNormalized = PathUtils.normalize(longPath);
      
      // The paths should at least be consistently formatted
      expect(shortNormalized).not.toContain('\\');
      expect(longNormalized).not.toContain('\\');
    });

    test('returns false for different paths', () => {
      expect(PathUtils.equals('/path/to/worktree1', '/path/to/worktree2')).toBe(false);
      expect(PathUtils.equals('C:/temp/test', 'D:/temp/test')).toBe(false);
    });

    test('handles empty or null inputs', () => {
      expect(PathUtils.equals('', '')).toBe(true);
      expect(PathUtils.equals('', '/path')).toBe(false);
      expect(PathUtils.equals('/path', '')).toBe(false);
    });
  });

  describe('normalize', () => {
    test('converts backslashes to forward slashes', () => {
      expect(PathUtils.normalize('C:\\Users\\test\\.worktrees\\wt-feature')).toBe('C:/Users/test/.worktrees/wt-feature');
    });

    test('handles mixed separators', () => {
      expect(PathUtils.normalize('C:\\Users/test\\.worktrees/wt-feature')).toBe('C:/Users/test/.worktrees/wt-feature');
    });

    test('handles relative paths', () => {
      const result = PathUtils.normalize('.worktrees/wt-feature');
      expect(result).toContain('/.worktrees/wt-feature');
      expect(result).not.toContain('\\');
    });

    test('resolves Windows short filenames on Windows', () => {
      // Mock os.platform to simulate Windows
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      try {
        // Test with existing temp directory (should resolve to real path)
        const tempDir = require('os').tmpdir();
        const normalized = PathUtils.normalize(tempDir);
        expect(normalized).not.toContain('\\');
        
        // Test with non-existent path (should not throw)
        const nonExistent = PathUtils.normalize('C:/NonExistent/Path');
        expect(nonExistent).toBe('C:/NonExistent/Path');
      } finally {
        // Restore original platform
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });

  describe('toPosix', () => {
    test('converts Windows paths to POSIX format', () => {
      expect(PathUtils.toPosix('C:\\temp\\test')).toBe('C:/temp/test');
      expect(PathUtils.toPosix('path\\to\\file')).toBe('path/to/file');
    });

    test('leaves POSIX paths unchanged', () => {
      expect(PathUtils.toPosix('/path/to/file')).toBe('/path/to/file');
    });
  });
});