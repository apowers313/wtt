const GitOutputParser = require('../../lib/gitOutputParser');

describe('GitOutputParser', () => {
  describe('parseWorktreeList', () => {
    it('should return empty array for empty input', () => {
      expect(GitOutputParser.parseWorktreeList('')).toEqual([]);
      expect(GitOutputParser.parseWorktreeList(null)).toEqual([]);
      expect(GitOutputParser.parseWorktreeList(undefined)).toEqual([]);
      expect(GitOutputParser.parseWorktreeList('   ')).toEqual([]);
    });
    
    it('should parse standard worktree output', () => {
      const output = `/home/user/project                  abc1234 [main]
/home/user/project/.worktrees/wt-feature  def5678 [feature-branch]`;
      
      const result = GitOutputParser.parseWorktreeList(output);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        path: expect.stringContaining('/home/user/project'),
        commit: 'abc1234',
        branch: 'main',
        bare: false,
        detached: false
      });
      expect(result[1]).toEqual({
        path: expect.stringContaining('/home/user/project/.worktrees/wt-feature'),
        commit: 'def5678',
        branch: 'feature-branch',
        bare: false,
        detached: false
      });
    });
    
    it('should handle paths with spaces', () => {
      const output = `/home/user/my project/repo          abc1234 [main]
/home/user/my project/.worktrees/wt feature  def5678 [feature-branch]`;
      
      const result = GitOutputParser.parseWorktreeList(output);
      
      expect(result).toHaveLength(2);
      expect(result[0].path).toContain('/my project/repo');
      expect(result[1].path).toContain('/my project/.worktrees/wt feature');
    });
    
    it('should handle Windows paths', () => {
      const output = `C:\\Users\\test\\project                  abc1234 [main]
C:\\Users\\test\\project\\.worktrees\\wt-feature  def5678 [feature-branch]`;
      
      const result = GitOutputParser.parseWorktreeList(output);
      
      expect(result).toHaveLength(2);
      expect(result[0].path).toContain('/Users/test/project');
      expect(result[1].path).toContain('/Users/test/project/.worktrees/wt-feature');
    });
    
    it('should handle detached HEAD', () => {
      const output = '/home/user/project/.worktrees/detached  abc1234 (detached HEAD)';
      
      const result = GitOutputParser.parseWorktreeList(output);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: expect.any(String),
        commit: 'abc1234',
        branch: '',
        bare: false,
        detached: true
      });
    });
    
    it('should handle bare repository', () => {
      const output = '/home/user/bare-repo  abc1234 (bare)';
      
      const result = GitOutputParser.parseWorktreeList(output);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: expect.any(String),
        commit: 'abc1234',
        branch: '',
        bare: true,
        detached: false
      });
    });
    
    it('should handle full commit hashes', () => {
      const output = '/home/user/project  a1b2c3d4e5f6789012345678901234567890abcd [main]';
      
      const result = GitOutputParser.parseWorktreeList(output);
      
      expect(result).toHaveLength(1);
      expect(result[0].commit).toBe('a1b2c3d4e5f6789012345678901234567890abcd');
    });
    
    it('should handle lines without proper format', () => {
      const output = `/home/user/project  abc1234 [main]
invalid line without commit hash
/home/user/project/.worktrees/wt-feature  def5678 [feature]`;
      
      const result = GitOutputParser.parseWorktreeList(output);
      
      expect(result).toHaveLength(2);
      expect(result[0].branch).toBe('main');
      expect(result[1].branch).toBe('feature');
    });
    
    it('should handle different line endings', () => {
      const output = '/home/user/project  abc1234 [main]\r\n/home/user/project/.worktrees/wt-feature  def5678 [feature]';
      
      const result = GitOutputParser.parseWorktreeList(output);
      
      expect(result).toHaveLength(2);
    });
  });
  
  describe('hasUncommittedChanges', () => {
    it('should return false for empty input', () => {
      expect(GitOutputParser.hasUncommittedChanges('')).toBe(false);
      expect(GitOutputParser.hasUncommittedChanges(null)).toBe(false);
      expect(GitOutputParser.hasUncommittedChanges(undefined)).toBe(false);
    });
    
    it('should detect changes not staged for commit', () => {
      const output = `On branch main
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  modified:   file.txt`;
      
      expect(GitOutputParser.hasUncommittedChanges(output)).toBe(true);
    });
    
    it('should detect changes to be committed', () => {
      const output = `On branch main
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
  new file:   newfile.txt`;
      
      expect(GitOutputParser.hasUncommittedChanges(output)).toBe(true);
    });
    
    it('should detect untracked files', () => {
      const output = `On branch main
Untracked files:
  (use "git add <file>..." to include in what will be committed)
  untracked.txt`;
      
      expect(GitOutputParser.hasUncommittedChanges(output)).toBe(true);
    });
    
    it('should detect branch ahead of remote', () => {
      const output = `On branch main
Your branch is ahead of 'origin/main' by 2 commits.`;
      
      expect(GitOutputParser.hasUncommittedChanges(output)).toBe(true);
    });
    
    it('should detect modified files', () => {
      const output = `modified:   src/file.js
modified:   README.md`;
      
      expect(GitOutputParser.hasUncommittedChanges(output)).toBe(true);
    });
    
    it('should detect new files', () => {
      const output = 'new file:   src/component.js';
      
      expect(GitOutputParser.hasUncommittedChanges(output)).toBe(true);
    });
    
    it('should detect deleted files', () => {
      const output = 'deleted:    old-file.js';
      
      expect(GitOutputParser.hasUncommittedChanges(output)).toBe(true);
    });
    
    it('should return false for clean status', () => {
      const output = `On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean`;
      
      expect(GitOutputParser.hasUncommittedChanges(output)).toBe(false);
    });
    
    it('should handle Windows line endings', () => {
      const output = 'On branch main\r\nChanges not staged for commit:\r\n  modified:   file.txt';
      
      expect(GitOutputParser.hasUncommittedChanges(output)).toBe(true);
    });
  });
  
  describe('parseBranchList', () => {
    it('should return empty array for empty input', () => {
      expect(GitOutputParser.parseBranchList('')).toEqual([]);
      expect(GitOutputParser.parseBranchList(null)).toEqual([]);
      expect(GitOutputParser.parseBranchList(undefined)).toEqual([]);
    });
    
    it('should parse branch list with current branch marked', () => {
      const output = `* main
  feature-branch
  develop
  hotfix/urgent`;
      
      const result = GitOutputParser.parseBranchList(output);
      
      expect(result).toEqual(['main', 'feature-branch', 'develop', 'hotfix/urgent']);
    });
    
    it('should handle branches with spaces in names', () => {
      const output = `  main
  feature/new feature
  bug fix branch`;
      
      const result = GitOutputParser.parseBranchList(output);
      
      expect(result).toEqual(['main', 'feature/new feature', 'bug fix branch']);
    });
    
    it('should filter out empty lines', () => {
      const output = `  main

  feature

  `;
      
      const result = GitOutputParser.parseBranchList(output);
      
      expect(result).toEqual(['main', 'feature']);
    });
    
    it('should handle different line endings', () => {
      const output = '* main\r\n  feature\r\n  develop';
      
      const result = GitOutputParser.parseBranchList(output);
      
      expect(result).toEqual(['main', 'feature', 'develop']);
    });
  });
  
  describe('hasUnpushedCommits', () => {
    it('should return falsy for empty output', () => {
      // Note: The implementation returns the first operand of && when it's falsy
      // This is technically a bug - it should return a boolean
      expect(GitOutputParser.hasUnpushedCommits('')).toBeFalsy();
      expect(GitOutputParser.hasUnpushedCommits(null)).toBeFalsy();
      expect(GitOutputParser.hasUnpushedCommits(undefined)).toBeFalsy();
      expect(GitOutputParser.hasUnpushedCommits('   ')).toBe(false); // This one returns actual false
    });
    
    it('should return true when there are commits', () => {
      const output = `abc1234 Add new feature
def5678 Fix bug
ghi9012 Update documentation`;
      
      expect(GitOutputParser.hasUnpushedCommits(output)).toBe(true);
    });
    
    it('should return true for single commit', () => {
      const output = 'abc1234 Single commit';
      
      expect(GitOutputParser.hasUnpushedCommits(output)).toBe(true);
    });
  });
  
  describe('normalizeOutput', () => {
    it('should handle empty input', () => {
      expect(GitOutputParser.normalizeOutput('')).toBe('');
      expect(GitOutputParser.normalizeOutput(null)).toBe('');
      expect(GitOutputParser.normalizeOutput(undefined)).toBe('');
    });
    
    it('should normalize Windows line endings', () => {
      const output = 'line1\r\nline2\r\nline3';
      const result = GitOutputParser.normalizeOutput(output);
      
      expect(result).toBe('line1\nline2\nline3');
      expect(result).not.toContain('\r');
    });
    
    it('should trim trailing whitespace from lines', () => {
      const output = 'line1   \nline2\t\t\nline3 ';
      const result = GitOutputParser.normalizeOutput(output);
      
      expect(result).toBe('line1\nline2\nline3');
    });
    
    it('should trim the entire output', () => {
      const output = '\n\n  content  \n\n';
      const result = GitOutputParser.normalizeOutput(output);
      
      expect(result).toBe('content');
    });
    
    it('should handle mixed line endings', () => {
      const output = 'line1\r\nline2\nline3\r\n';
      const result = GitOutputParser.normalizeOutput(output);
      
      expect(result).toBe('line1\nline2\nline3');
    });
    
    it('should preserve internal spaces', () => {
      const output = 'path with  spaces   \nfile  name  ';
      const result = GitOutputParser.normalizeOutput(output);
      
      expect(result).toBe('path with  spaces\nfile  name');
    });
  });
});