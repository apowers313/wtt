const BackupManager = require('../../../lib/merge-helper/backup-manager');
const fs = require('fs-extra');
const path = require('path');
const simpleGit = require('simple-git');

// Mock dependencies
jest.mock('fs-extra');
jest.mock('simple-git');

describe('BackupManager', () => {
  let backupManager;
  let mockGit;
  const testBaseDir = '/test/project';

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockGit = {
      status: jest.fn(),
      revparse: jest.fn(),
      diff: jest.fn(),
      stashList: jest.fn(),
      show: jest.fn(),
      checkout: jest.fn(),
      reset: jest.fn(),
      raw: jest.fn()
    };
    
    simpleGit.mockReturnValue(mockGit);
    backupManager = new BackupManager(testBaseDir);
    
    // Mock fs operations
    fs.ensureDir.mockResolvedValue();
    fs.writeJSON.mockResolvedValue();
    fs.readJSON.mockResolvedValue({});
    fs.pathExists.mockResolvedValue(true);
    fs.readdir.mockResolvedValue([]);
    fs.remove.mockResolvedValue();
  });

  describe('init', () => {
    it('should create backup directory', async () => {
      await backupManager.init();
      
      expect(fs.ensureDir).toHaveBeenCalledWith(
        path.join(testBaseDir, '.worktrees', '.backups')
      );
    });
  });

  describe('createSafetyBackup', () => {
    beforeEach(() => {
      mockGit.status.mockResolvedValue({ current: 'main', files: [] });
      mockGit.revparse.mockResolvedValue('abc123');
      mockGit.stashList.mockResolvedValue({ all: [] });
    });

    it('should create a backup with basic information', async () => {
      const backup = await backupManager.createSafetyBackup('merge');

      expect(backup).toHaveProperty('id');
      expect(backup).toHaveProperty('operation', 'merge');
      expect(backup).toHaveProperty('branch', 'main');
      expect(backup).toHaveProperty('commit', 'abc123');
      expect(backup).toHaveProperty('timestamp');
    });

    it('should save backup metadata to JSON file', async () => {
      await backupManager.createSafetyBackup('merge');

      expect(fs.writeJSON).toHaveBeenCalledWith(
        expect.stringMatching(/backup-info\.json$/),
        expect.objectContaining({
          operation: 'merge',
          branch: 'main',
          commit: 'abc123'
        }),
        { spaces: 2 }
      );
    });

    it('should save uncommitted changes when they exist', async () => {
      mockGit.status.mockResolvedValue({ current: 'main', files: ['modified.js'] });
      mockGit.diff.mockResolvedValueOnce('staged diff').mockResolvedValueOnce('unstaged diff');

      const backup = await backupManager.createSafetyBackup('merge');

      expect(backup.uncommittedChanges).toEqual({ saved: true, path: expect.any(String) });
      expect(mockGit.diff).toHaveBeenCalledWith(['--cached']);
      expect(mockGit.diff).toHaveBeenCalledWith();
    });

    it('should handle git errors gracefully', async () => {
      // Mock console.log to avoid test noise
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      mockGit.status.mockRejectedValue(new Error('Git error'));
      mockGit.revparse.mockRejectedValue(new Error('Git error'));

      // Should not throw, but return backup with default values
      const backup = await backupManager.createSafetyBackup('merge');
      
      expect(backup).toHaveProperty('branch', 'HEAD');
      expect(backup).toHaveProperty('commit', null);
      expect(backup).toHaveProperty('operation', 'merge');
        
      consoleLogSpy.mockRestore();
    });

    it('should clean up partial backup on failure', async () => {
      mockGit.status.mockResolvedValue({ current: 'main', files: [] });
      fs.writeJSON.mockRejectedValue(new Error('Write error'));

      await expect(backupManager.createSafetyBackup('merge'))
        .rejects.toThrow('Backup creation failed');

      expect(fs.remove).toHaveBeenCalledWith(expect.stringMatching(/merge-/));
    });
  });

  describe('restoreFromBackup', () => {
    const mockBackupInfo = {
      id: 'merge-2024-01-20T10-30-00-000Z',
      operation: 'merge',
      timestamp: '2024-01-20T10:30:00.000Z',
      branch: 'feature-auth',
      commit: 'def456',
      uncommittedChanges: { saved: true, path: '/backup/path/uncommitted-changes' },
      stashes: { saved: true, count: 1, path: '/backup/path/stashes' }
    };

    beforeEach(() => {
      fs.readJSON.mockResolvedValue(mockBackupInfo);
      fs.writeFile.mockResolvedValue();
      fs.copy.mockResolvedValue();
      fs.readFile.mockResolvedValue('');
      
      // Mock console methods to avoid test noise
      jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'warn').mockImplementation();
    });
    
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should restore branch and commit', async () => {
      const restored = await backupManager.restoreFromBackup('merge-test-123');

      expect(mockGit.checkout).toHaveBeenCalledWith('feature-auth');
      expect(mockGit.reset).toHaveBeenCalledWith('hard', 'def456');
      expect(restored).toEqual(mockBackupInfo);
    });

    it('should skip reset when keepChanges option is true', async () => {
      await backupManager.restoreFromBackup('merge-test-123', { keepChanges: true });

      expect(mockGit.checkout).toHaveBeenCalledWith('feature-auth');
      expect(mockGit.reset).not.toHaveBeenCalled();
    });

    it('should throw error when backup not found', async () => {
      fs.pathExists.mockResolvedValue(false);

      await expect(backupManager.restoreFromBackup('nonexistent'))
        .rejects.toThrow('Backup \'nonexistent\' not found');
    });

    it('should handle restoration errors', async () => {
      mockGit.checkout.mockRejectedValue(new Error('Checkout failed'));

      await expect(backupManager.restoreFromBackup('merge-test-123'))
        .rejects.toThrow('Backup restoration failed');
    });
  });

  describe('listBackups', () => {
    it('should return empty array when no backups exist', async () => {
      fs.readdir.mockResolvedValue([]);
      
      const backups = await backupManager.listBackups();
      
      expect(backups).toEqual([]);
    });

    it('should return sorted backup list', async () => {
      const backup1 = { id: 'backup1', timestamp: '2024-01-20T10:30:00.000Z' };
      const backup2 = { id: 'backup2', timestamp: '2024-01-20T11:30:00.000Z' };
      
      fs.readdir.mockResolvedValue(['backup1', 'backup2']);
      fs.readJSON.mockResolvedValueOnce(backup1).mockResolvedValueOnce(backup2);
      
      const backups = await backupManager.listBackups();
      
      expect(backups).toHaveLength(2);
      expect(backups[0]).toEqual(backup2); // Should be sorted newest first
      expect(backups[1]).toEqual(backup1);
    });

    it('should skip invalid backup directories', async () => {
      fs.readdir.mockResolvedValue(['valid-backup', 'invalid-dir']);
      fs.pathExists.mockImplementation((path) => {
        // Return true for the backup dir itself and valid backup info file
        if (path.endsWith('.backups')) return Promise.resolve(true);
        return Promise.resolve(path.includes('valid-backup') && path.endsWith('backup-info.json'));
      });
      fs.readJSON.mockResolvedValue({ timestamp: '2024-01-20T10:30:00.000Z' });
      
      const backups = await backupManager.listBackups();
      
      expect(backups).toHaveLength(1);
      expect(backups[0].id).toBe('valid-backup');
    });

    it('should handle readdir errors', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readdir.mockRejectedValue(new Error('Directory read error'));
      
      await expect(backupManager.listBackups()).rejects.toThrow('Directory read error');
    });
  });

  describe('deleteBackup', () => {
    it('should delete backup directory', async () => {
      await backupManager.deleteBackup('test-backup');
      
      expect(fs.remove).toHaveBeenCalledWith(
        path.join(testBaseDir, '.worktrees', '.backups', 'test-backup')
      );
    });

    it('should throw error when backup not found', async () => {
      fs.pathExists.mockResolvedValue(false);
      
      await expect(backupManager.deleteBackup('nonexistent'))
        .rejects.toThrow('Backup \'nonexistent\' not found');
    });
  });

  describe('cleanOldBackups', () => {
    it('should delete backups older than specified days', async () => {
      const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
      const recentDate = new Date().toISOString();
      
      const oldBackup = { id: 'old-backup', timestamp: oldDate };
      const recentBackup = { id: 'recent-backup', timestamp: recentDate };
      
      jest.spyOn(backupManager, 'listBackups').mockResolvedValue([oldBackup, recentBackup]);
      jest.spyOn(backupManager, 'deleteBackup').mockResolvedValue();
      
      const deletedCount = await backupManager.cleanOldBackups(30);
      
      expect(deletedCount).toBe(1);
      expect(backupManager.deleteBackup).toHaveBeenCalledWith('old-backup');
      expect(backupManager.deleteBackup).not.toHaveBeenCalledWith('recent-backup');
    });

    it('should return zero when no old backups exist', async () => {
      const recentDate = new Date().toISOString();
      const recentBackup = { id: 'recent-backup', timestamp: recentDate };
      
      jest.spyOn(backupManager, 'listBackups').mockResolvedValue([recentBackup]);
      
      const deletedCount = await backupManager.cleanOldBackups(30);
      
      expect(deletedCount).toBe(0);
    });
  });

  describe('helper methods', () => {
    describe('getCurrentBranch', () => {
      it('should return current branch name', async () => {
        mockGit.status.mockResolvedValue({ current: 'feature-branch' });
        
        const branch = await backupManager.getCurrentBranch();
        
        expect(branch).toBe('feature-branch');
      });

      it('should return HEAD on error', async () => {
        mockGit.status.mockRejectedValue(new Error('Git error'));
        
        const branch = await backupManager.getCurrentBranch();
        
        expect(branch).toBe('HEAD');
      });
    });

    describe('getCurrentCommit', () => {
      it('should return current commit hash', async () => {
        mockGit.revparse.mockResolvedValue('abc123def456');
        
        const commit = await backupManager.getCurrentCommit();
        
        expect(commit).toBe('abc123def456');
        expect(mockGit.revparse).toHaveBeenCalledWith(['HEAD']);
      });

      it('should return null on error', async () => {
        mockGit.revparse.mockRejectedValue(new Error('Git error'));
        
        const commit = await backupManager.getCurrentCommit();
        
        expect(commit).toBe(null);
      });
    });

    describe('hasUncommittedChanges', () => {
      it('should return true when files are modified', async () => {
        mockGit.status.mockResolvedValue({ files: ['modified.js'] });
        
        const hasChanges = await backupManager.hasUncommittedChanges();
        
        expect(hasChanges).toBe(true);
      });

      it('should return false when no files are modified', async () => {
        mockGit.status.mockResolvedValue({ files: [] });
        
        const hasChanges = await backupManager.hasUncommittedChanges();
        
        expect(hasChanges).toBe(false);
      });

      it('should return false on git error', async () => {
        mockGit.status.mockRejectedValue(new Error('Git error'));
        
        const hasChanges = await backupManager.hasUncommittedChanges();
        
        expect(hasChanges).toBe(false);
      });
    });
  });
});