const gitOps = require('../../lib/gitOps-refactored');
const simpleGit = require('simple-git');
const PathUtils = require('../../lib/pathUtils');
const GitOutputParser = require('../../lib/gitOutputParser');

// Mock the dependencies
jest.mock('simple-git');
jest.mock('../../lib/pathUtils');
jest.mock('../../lib/gitOutputParser');

describe('GitOps - Extended Coverage', () => {
  let mockGit;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock git instance
    mockGit = {
      status: jest.fn(),
      branch: jest.fn(),
      raw: jest.fn(),
      checkout: jest.fn(),
      merge: jest.fn(),
      pull: jest.fn()
    };
    
    // Make simpleGit return our mock
    simpleGit.mockReturnValue(mockGit);
    
    // Reset the gitOps instance to use our mock
    gitOps.git = mockGit;
  });
  
  describe('getCurrentBranch', () => {
    it('should return the current branch name', async () => {
      mockGit.branch.mockResolvedValue({ current: 'feature-branch' });
      
      const result = await gitOps.getCurrentBranch();
      
      expect(result).toBe('feature-branch');
      expect(mockGit.branch).toHaveBeenCalledTimes(1);
    });
    
    it('should handle git errors gracefully', async () => {
      mockGit.branch.mockRejectedValue(new Error('Git error'));
      
      await expect(gitOps.getCurrentBranch()).rejects.toThrow('Git error');
    });
  });
  
  describe('validateRepository', () => {
    it('should return true for valid repository', async () => {
      mockGit.status.mockResolvedValue({});
      
      const result = await gitOps.validateRepository();
      
      expect(result).toBe(true);
      expect(mockGit.status).toHaveBeenCalledTimes(1);
    });
    
    it('should throw error when not in a git repository', async () => {
      mockGit.status.mockRejectedValue(new Error('not a git repository'));
      
      await expect(gitOps.validateRepository()).rejects.toThrow(
        'This command must be run inside a git repository. Please navigate to your project folder or run \'git init\' to create a new repository'
      );
    });
  });
  
  describe('createWorktree', () => {
    beforeEach(() => {
      PathUtils.toPosix.mockImplementation(p => p.replace(/\\/g, '/'));
    });
    
    it('should throw error when trying to create worktree with existing branch', async () => {
      mockGit.branch.mockResolvedValue({ all: ['main', 'existing-branch'] });
      
      await expect(gitOps.createWorktree('/path/to/worktree', 'existing-branch', 'main'))
        .rejects.toThrow('Branch \'existing-branch\' already exists. Use \'wt switch existing-branch\' to work on the existing branch, or choose a different name for your new branch');
      
      expect(mockGit.raw).not.toHaveBeenCalled();
    });
    
    it('should create worktree with new branch from base branch', async () => {
      mockGit.branch.mockResolvedValue({ all: ['main'] });
      mockGit.raw.mockResolvedValue('');
      
      await gitOps.createWorktree('/path/to/worktree', 'new-feature', 'main');
      
      expect(mockGit.raw).toHaveBeenCalledWith([
        'worktree', 'add', '-b', 'new-feature', '/path/to/worktree', 'main'
      ]);
    });
    
    it('should create worktree for existing branch without base branch', async () => {
      mockGit.raw.mockResolvedValue('');
      
      await gitOps.createWorktree('/path/to\\worktree', 'existing-branch');
      
      expect(PathUtils.toPosix).toHaveBeenCalledWith('/path/to\\worktree');
      expect(mockGit.raw).toHaveBeenCalledWith([
        'worktree', 'add', '/path/to/worktree', 'existing-branch'
      ]);
    });
  });
  
  describe('removeWorktree', () => {
    beforeEach(() => {
      PathUtils.toPosix.mockImplementation(p => p.replace(/\\/g, '/'));
    });
    
    it('should remove worktree normally', async () => {
      mockGit.raw.mockResolvedValue('');
      
      await gitOps.removeWorktree('/path/to\\worktree');
      
      expect(PathUtils.toPosix).toHaveBeenCalledWith('/path/to\\worktree');
      expect(mockGit.raw).toHaveBeenCalledWith([
        'worktree', 'remove', '/path/to/worktree'
      ]);
    });
    
    it('should remove worktree with force flag', async () => {
      mockGit.raw.mockResolvedValue('');
      
      await gitOps.removeWorktree('/path/to/worktree', true);
      
      expect(mockGit.raw).toHaveBeenCalledWith([
        'worktree', 'remove', '/path/to/worktree', '--force'
      ]);
    });
  });
  
  describe('hasUncommittedChanges', () => {
    beforeEach(() => {
      PathUtils.toPosix.mockImplementation(p => p.replace(/\\/g, '/'));
    });
    
    it('should detect uncommitted changes in main repository', async () => {
      mockGit.status.mockResolvedValue({ isClean: () => false });
      
      const result = await gitOps.hasUncommittedChanges();
      
      expect(result).toBe(true);
      expect(mockGit.status).toHaveBeenCalled();
      expect(mockGit.raw).not.toHaveBeenCalled();
    });
    
    it('should return false for clean main repository', async () => {
      mockGit.status.mockResolvedValue({ isClean: () => true });
      
      const result = await gitOps.hasUncommittedChanges();
      
      expect(result).toBe(false);
    });
    
    it('should detect uncommitted changes in specified worktree', async () => {
      mockGit.raw.mockResolvedValue(' M file.txt\n');
      
      const result = await gitOps.hasUncommittedChanges('/path/to/worktree');
      
      expect(result).toBe(true);
      expect(mockGit.raw).toHaveBeenCalledWith([
        '-C', '/path/to/worktree', 'status', '--porcelain'
      ]);
    });
    
    it('should return false for clean worktree', async () => {
      mockGit.raw.mockResolvedValue('');
      
      const result = await gitOps.hasUncommittedChanges('/path/to/worktree');
      
      expect(result).toBe(false);
    });
  });
  
  describe('hasUnpushedCommits', () => {
    beforeEach(() => {
      PathUtils.toPosix.mockImplementation(p => p.replace(/\\/g, '/'));
      GitOutputParser.hasUnpushedCommits.mockImplementation(output => output.trim().length > 0);
    });
    
    it('should detect unpushed commits in main repository', async () => {
      mockGit.raw.mockResolvedValue('abc123 Unpushed commit\n');
      
      const result = await gitOps.hasUnpushedCommits();
      
      expect(result).toBe(true);
      expect(mockGit.raw).toHaveBeenCalledWith(['log', '@{u}..HEAD', '--oneline']);
      expect(GitOutputParser.hasUnpushedCommits).toHaveBeenCalledWith('abc123 Unpushed commit\n');
    });
    
    it('should return false when no unpushed commits', async () => {
      mockGit.raw.mockResolvedValue('');
      
      const result = await gitOps.hasUnpushedCommits();
      
      expect(result).toBe(false);
    });
    
    it('should detect unpushed commits in specified worktree', async () => {
      mockGit.raw.mockResolvedValue('def456 Another unpushed\n');
      
      const result = await gitOps.hasUnpushedCommits('/path/to/worktree');
      
      expect(result).toBe(true);
      expect(mockGit.raw).toHaveBeenCalledWith([
        '-C', '/path/to/worktree', 'log', '@{u}..HEAD', '--oneline'
      ]);
    });
    
    it('should return false when no upstream branch configured', async () => {
      mockGit.raw.mockRejectedValue(new Error('no upstream configured'));
      
      const result = await gitOps.hasUnpushedCommits();
      
      expect(result).toBe(false);
    });
    
    it('should rethrow non-upstream errors', async () => {
      mockGit.raw.mockRejectedValue(new Error('other git error'));
      
      await expect(gitOps.hasUnpushedCommits()).rejects.toThrow('other git error');
    });
  });
  
  describe('getWorktreeInfo', () => {
    beforeEach(() => {
      PathUtils.toPosix.mockImplementation(p => p.replace(/\\/g, '/'));
    });
    
    it('should return correct file status counts', async () => {
      mockGit.raw.mockResolvedValue(' M modified.txt\nA  added.txt\n D deleted.txt\nM  another-modified.txt\n');
      
      const result = await gitOps.getWorktreeInfo('/path/to/worktree');
      
      expect(result).toEqual({
        modified: 2,
        added: 1,
        deleted: 1,
        total: 4
      });
      expect(mockGit.raw).toHaveBeenCalledWith([
        '-C', '/path/to/worktree', 'status', '--porcelain'
      ]);
    });
    
    it('should handle empty status', async () => {
      mockGit.raw.mockResolvedValue('');
      
      const result = await gitOps.getWorktreeInfo('/path/to/worktree');
      
      expect(result).toEqual({
        modified: 0,
        added: 0,
        deleted: 0,
        total: 0
      });
    });
    
    it('should handle mixed status indicators', async () => {
      mockGit.raw.mockResolvedValue('MM modified-in-both.txt\nAM added-then-modified.txt\nMD modified-then-deleted.txt\n');
      
      const result = await gitOps.getWorktreeInfo('/path/to/worktree');
      
      expect(result).toEqual({
        modified: 3,
        added: 1,
        deleted: 1,
        total: 3
      });
    });
  });
  
  describe('deleteBranch', () => {
    it('should delete branch normally', async () => {
      mockGit.branch.mockResolvedValue('');
      
      await gitOps.deleteBranch('feature-branch');
      
      expect(mockGit.branch).toHaveBeenCalledWith(['-d', 'feature-branch']);
    });
    
    it('should force delete branch when force flag is true', async () => {
      mockGit.branch.mockResolvedValue('');
      
      await gitOps.deleteBranch('feature-branch', true);
      
      expect(mockGit.branch).toHaveBeenCalledWith(['-D', 'feature-branch']);
    });
  });
  
  describe('mergeBranch', () => {
    it('should checkout target branch and merge source branch', async () => {
      mockGit.checkout.mockResolvedValue('');
      mockGit.merge.mockResolvedValue('');
      
      await gitOps.mergeBranch('feature-branch', 'main');
      
      expect(mockGit.checkout).toHaveBeenCalledWith('main');
      expect(mockGit.merge).toHaveBeenCalledWith(['feature-branch']);
    });
    
    it('should propagate checkout errors', async () => {
      mockGit.checkout.mockRejectedValue(new Error('Checkout failed'));
      
      await expect(gitOps.mergeBranch('feature', 'main')).rejects.toThrow('Checkout failed');
      expect(mockGit.merge).not.toHaveBeenCalled();
    });
    
    it('should propagate merge errors', async () => {
      mockGit.checkout.mockResolvedValue('');
      mockGit.merge.mockRejectedValue(new Error('Merge conflict'));
      
      await expect(gitOps.mergeBranch('feature', 'main')).rejects.toThrow('Merge conflict');
    });
  });
  
  describe('pull', () => {
    it('should pull from origin with specified branch', async () => {
      mockGit.pull.mockResolvedValue('');
      
      await gitOps.pull('main');
      
      expect(mockGit.pull).toHaveBeenCalledWith('origin', 'main');
    });
    
    it('should pull without arguments when no branch specified', async () => {
      mockGit.pull.mockResolvedValue('');
      
      await gitOps.pull();
      
      expect(mockGit.pull).toHaveBeenCalledWith();
    });
    
    it('should propagate pull errors', async () => {
      mockGit.pull.mockRejectedValue(new Error('Network error'));
      
      await expect(gitOps.pull()).rejects.toThrow('Network error');
    });
  });
  
  describe('isWorktreePath', () => {
    it('should delegate to PathUtils.isWorktreePath', () => {
      PathUtils.isWorktreePath.mockReturnValue(true);
      
      const result = gitOps.isWorktreePath('/path/to/.worktrees/feature');
      
      expect(result).toBe(true);
      expect(PathUtils.isWorktreePath).toHaveBeenCalledWith('/path/to/.worktrees/feature');
    });
  });
});