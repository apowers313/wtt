const config = require('../../lib/config');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('Config module (integration)', () => {
  let tempDir;
  let originalCwd;
  
  beforeEach(async () => {
    // Save original working directory
    originalCwd = process.cwd();
    
    // Create temp directory and change to it
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
    // Resolve to handle symlinks (e.g., /var -> /private/var on macOS)
    tempDir = await fs.realpath(tempDir);
    process.chdir(tempDir);
    
    // Reset config state
    config.config = null;
    config.configPath = null;
  });
  
  afterEach(async () => {
    // Restore original working directory
    process.chdir(originalCwd);
    
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  describe('exists', () => {
    test('returns true when config file exists', async () => {
      // Create config file
      await fs.writeJSON('.worktree-config.json', { test: true });
      
      const result = await config.exists();
      
      expect(result).toBe(true);
    });

    test('returns false when config file does not exist', async () => {
      const result = await config.exists();
      
      expect(result).toBe(false);
    });
  });

  describe('load', () => {
    test('throws when config file does not exist', async () => {
      await expect(config.load()).rejects.toThrow('Configuration not found. Run "wt init" first.');
    });

    test('loads and returns config when file exists', async () => {
      const mockConfig = {
        baseDir: '.worktrees',
        portRanges: {
          vite: { start: 3000, increment: 10 },
          storybook: { start: 6006, increment: 10 },
          custom: { start: 8000, increment: 10 }
        },
        mainBranch: 'main',
        namePattern: 'wt-{branch}'
      };
      
      await fs.writeJSON('.worktree-config.json', mockConfig);
      
      const result = await config.load();
      
      expect(result).toEqual(mockConfig);
      expect(config.config).toEqual(mockConfig);
    });

    test('throws on invalid JSON', async () => {
      await fs.writeFile('.worktree-config.json', 'invalid json{');
      
      await expect(config.load()).rejects.toThrow();
    });
  });

  describe('init', () => {
    test('creates config with default values', async () => {
      const result = await config.init();
      
      expect(result).toMatchObject({
        baseDir: '.worktrees',
        portRanges: {
          vite: { start: 3000, increment: 10 },
          storybook: { start: 6006, increment: 10 },
          custom: { start: 8000, increment: 10 }
        },
        mainBranch: 'main',
        namePattern: 'wt-{branch}'
      });
      
      // Verify file was created
      const fileContent = await fs.readJSON('.worktree-config.json');
      expect(fileContent).toMatchObject({
        baseDir: '.worktrees',
        mainBranch: 'main'
      });
    });

    test('returns existing config when already exists', async () => {
      const existingConfig = {
        baseDir: 'custom-worktrees',
        mainBranch: 'develop',
        portRanges: { vite: { start: 3000, increment: 10 } },
        namePattern: 'wt-{branch}'
      };
      
      await fs.writeJSON('.worktree-config.json', existingConfig);
      
      const result = await config.init();
      
      expect(result).toEqual(existingConfig);
    });
  });

  describe('save', () => {
    test('saves current config to file', async () => {
      // Initialize first
      await config.init();
      
      // Modify config
      config.config.mainBranch = 'develop';
      
      await config.save();
      
      // Verify file was updated
      const fileContent = await fs.readJSON('.worktree-config.json');
      expect(fileContent.mainBranch).toBe('develop');
    });

    test('throws when config not loaded', async () => {
      config.config = null;
      
      await expect(config.save()).rejects.toThrow('Configuration not loaded');
    });
  });

  describe('get', () => {
    test('returns loaded config', async () => {
      // Write a fresh default config to ensure clean state
      await fs.writeJSON('.worktree-config.json', {
        baseDir: '.worktrees',
        portRanges: {
          vite: { start: 3000, increment: 10 },
          storybook: { start: 6006, increment: 10 },
          custom: { start: 8000, increment: 10 }
        },
        mainBranch: 'main',
        namePattern: 'wt-{branch}'
      });
      
      await config.load();
      const result = config.get();
      
      expect(result).toMatchObject({
        mainBranch: 'main',
        baseDir: '.worktrees'
      });
    });

    test('throws when config not loaded', () => {
      config.config = null;
      
      expect(() => config.get()).toThrow('Configuration not loaded');
    });
  });

  describe('getWorktreeName', () => {
    test('applies name pattern correctly', async () => {
      await config.init();
      
      const name = config.getWorktreeName('feature-auth-system');
      
      expect(name).toBe('wt-feature-auth-system');
    });

    test('handles branch names with slashes', async () => {
      await config.init();
      
      const name = config.getWorktreeName('feature/auth-system');
      
      expect(name).toBe('wt-feature/auth-system');
    });

    test('throws when config not loaded', () => {
      config.config = null;
      
      expect(() => config.getWorktreeName('feature')).toThrow('Configuration not loaded');
    });
  });

  describe('getWorktreePath', () => {
    test('returns correct worktree path', async () => {
      await config.init();
      
      const result = config.getWorktreePath('wt-feature', tempDir);
      
      expect(result).toBe(path.join(tempDir, '.worktrees', 'wt-feature'));
    });

    test('uses current directory as default', async () => {
      await config.init();
      
      const result = config.getWorktreePath('wt-feature');
      
      expect(result).toBe(path.join(tempDir, '.worktrees', 'wt-feature'));
    });

    test('throws when config not loaded', () => {
      config.config = null;
      
      expect(() => config.getWorktreePath('wt-feature')).toThrow('Configuration not loaded');
    });
  });

  describe('getBaseDir', () => {
    test('returns base directory path', async () => {
      await config.init();
      
      const result = config.getBaseDir(tempDir);
      
      expect(result).toBe(path.join(tempDir, '.worktrees'));
    });

    test('uses current directory as default', async () => {
      await config.init();
      
      const result = config.getBaseDir();
      
      expect(result).toBe(path.join(tempDir, '.worktrees'));
    });

    test('throws when config not loaded', () => {
      config.config = null;
      
      expect(() => config.getBaseDir()).toThrow('Configuration not loaded');
    });
  });
});