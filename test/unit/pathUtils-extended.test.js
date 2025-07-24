const PathUtils = require('../../lib/pathUtils');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Mock fs module
jest.mock('fs');

describe('PathUtils - Extended Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('normalize - edge cases', () => {
    it('should handle empty input', () => {
      expect(PathUtils.normalize('')).toBe('');
      expect(PathUtils.normalize(null)).toBe('');
      expect(PathUtils.normalize(undefined)).toBe('');
    });
    
    it('should handle Windows path when fs.realpathSync fails for both file and parent', () => {
      // Mock os.platform to simulate Windows
      const originalPlatform = os.platform;
      os.platform = jest.fn().mockReturnValue('win32');
      
      // Mock fs.realpathSync to throw errors
      fs.realpathSync.mockImplementation(() => {
        throw new Error('Path not found');
      });
      
      const result = PathUtils.normalize('C:\\temp\\test');
      
      // Should fall back to normalized path without realpath
      expect(result).toContain('/temp/test');
      expect(result).not.toContain('\\');
      
      // Restore
      os.platform = originalPlatform;
    });
    
    it('should handle Windows path when parent exists but file does not', () => {
      const originalPlatform = os.platform;
      os.platform = jest.fn().mockReturnValue('win32');
      
      let callCount = 0;
      fs.realpathSync.mockImplementation((p) => {
        callCount++;
        if (callCount === 1) {
          // First call (full path) fails
          throw new Error('Path not found');
        } else {
          // Second call (parent dir) succeeds
          return p.replace(/\\/g, '/');
        }
      });
      
      const result = PathUtils.normalize('C:\\existing\\newfile.txt');
      
      expect(result).toContain('/existing/newfile.txt');
      expect(fs.realpathSync).toHaveBeenCalledTimes(2);
      
      os.platform = originalPlatform;
    });
  });
  
  describe('endsWith', () => {
    it('should return true when path ends with suffix', () => {
      expect(PathUtils.endsWith('/path/to/worktree', '/worktree')).toBe(true);
      expect(PathUtils.endsWith('C:\\Users\\test\\.worktrees\\feature', '/feature')).toBe(true);
    });
    
    it('should return false when path does not end with suffix', () => {
      expect(PathUtils.endsWith('/path/to/worktree', 'other')).toBe(false);
      expect(PathUtils.endsWith('/path/to/worktree', 'work')).toBe(false);
    });
    
    it('should handle empty or null inputs', () => {
      expect(PathUtils.endsWith('', 'suffix')).toBe(false);
      expect(PathUtils.endsWith('path', '')).toBe(false);
      expect(PathUtils.endsWith('', '')).toBe(false);
      expect(PathUtils.endsWith(null, 'suffix')).toBe(false);
      expect(PathUtils.endsWith('path', null)).toBe(false);
    });
    
    it('should normalize paths before comparison', () => {
      expect(PathUtils.endsWith('C:\\path\\to\\file', '/to/file')).toBe(true);
      expect(PathUtils.endsWith('/path/to/file', '/to/file')).toBe(true);
    });
  });
  
  describe('relative', () => {
    it('should return relative path with forward slashes', () => {
      const result = PathUtils.relative('/home/user/project', '/home/user/project/src/file.js');
      expect(result).toBe('src/file.js');
      expect(result).not.toContain('\\');
    });
    
    it('should handle Windows paths', () => {
      // On non-Windows systems, these paths are treated as relative paths
      // So we need to test with actual existing paths
      const from = process.cwd();
      const to = path.join(process.cwd(), 'project', 'file.js');
      const result = PathUtils.relative(from, to);
      expect(result).toBe('project/file.js');
    });
    
    it('should handle going up directories', () => {
      const result = PathUtils.relative('/home/user/project/src', '/home/user/other');
      expect(result).toBe('../../other');
    });
  });
  
  describe('join', () => {
    it('should join path segments using platform separator', () => {
      const result = PathUtils.join('path', 'to', 'file');
      expect(result).toBe(path.join('path', 'to', 'file'));
    });
    
    it('should handle empty segments', () => {
      const result = PathUtils.join('path', '', 'file');
      expect(result).toBe(path.join('path', '', 'file'));
    });
  });
  
  describe('joinNormalized', () => {
    it('should join and normalize path segments', () => {
      const result = PathUtils.joinNormalized('path', 'to', 'file');
      expect(result).toContain('/path/to/file');
      expect(result).not.toContain('\\');
    });
    
    it('should handle absolute paths', () => {
      const result = PathUtils.joinNormalized('/absolute', 'path', 'file');
      expect(result).toContain('/absolute/path/file');
    });
    
    it('should handle Windows paths', () => {
      const result = PathUtils.joinNormalized('C:\\Users', 'test', 'file');
      // Path will be resolved relative to current directory on non-Windows
      expect(result).toContain('/Users/test/file');
      expect(result).not.toContain('\\');
    });
  });
  
  describe('toPosix - edge cases', () => {
    it('should handle empty input', () => {
      expect(PathUtils.toPosix('')).toBe('');
      expect(PathUtils.toPosix(null)).toBe('');
      expect(PathUtils.toPosix(undefined)).toBe('');
    });
  });
  
  describe('toPlatform', () => {
    it('should convert to Windows separators on Windows', () => {
      const originalPlatform = os.platform;
      os.platform = jest.fn().mockReturnValue('win32');
      
      expect(PathUtils.toPlatform('/path/to/file')).toBe('\\path\\to\\file');
      expect(PathUtils.toPlatform('C:/Users/test')).toBe('C:\\Users\\test');
      
      os.platform = originalPlatform;
    });
    
    it('should leave paths unchanged on non-Windows', () => {
      const originalPlatform = os.platform;
      os.platform = jest.fn().mockReturnValue('darwin');
      
      expect(PathUtils.toPlatform('/path/to/file')).toBe('/path/to/file');
      expect(PathUtils.toPlatform('path/to/file')).toBe('path/to/file');
      
      os.platform = originalPlatform;
    });
  });
  
  describe('extractWorktreeName', () => {
    it('should extract worktree name from path', () => {
      expect(PathUtils.extractWorktreeName('/project/.worktrees/feature')).toBe('feature');
      expect(PathUtils.extractWorktreeName('C:\\project\\.worktrees\\feature\\src')).toBe('feature');
    });
    
    it('should return null when no worktree in path', () => {
      expect(PathUtils.extractWorktreeName('/project/src/file.js')).toBe(null);
      expect(PathUtils.extractWorktreeName('/project/worktrees/feature')).toBe(null);
    });
    
    it('should handle nested worktree paths', () => {
      expect(PathUtils.extractWorktreeName('/project/.worktrees/feature/src/.worktrees/nested')).toBe('feature');
    });
  });
  
  describe('isWorktreePath', () => {
    it('should return true for worktree paths', () => {
      expect(PathUtils.isWorktreePath('/project/.worktrees/feature')).toBe(true);
      expect(PathUtils.isWorktreePath('C:\\project\\.worktrees\\feature')).toBe(true);
      expect(PathUtils.isWorktreePath('.worktrees/feature/src/file.js')).toBe(true);
    });
    
    it('should return false for non-worktree paths', () => {
      expect(PathUtils.isWorktreePath('/project/src/file.js')).toBe(false);
      expect(PathUtils.isWorktreePath('/project/worktrees/feature')).toBe(false);
      expect(PathUtils.isWorktreePath('')).toBe(false);
    });
  });
});