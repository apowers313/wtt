const config = require('../../lib/config');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

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
    
    // Initialize git repository
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });
    
    // Reset config state
    config.config = null;
    config.configPath = null;
    config.mainRoot = null;
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
      await expect(config.load()).rejects.toThrow('No worktree configuration found in this repository. Please run "wt init" to set up the worktree tool');
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
        namePattern: '{branch}'
      };
      
      await fs.writeJSON('.worktree-config.json', mockConfig);
      
      const result = await config.load();
      
      // Should include defaults merged with loaded config
      expect(result).toMatchObject(mockConfig);
      expect(result.autoCleanup).toBe(true); // From defaults
      expect(result.prompts).toBeDefined(); // From defaults
      expect(config.config).toEqual(result);
    });

    test('merges partial config with defaults', async () => {
      // Write a config file with only mainBranch (missing namePattern)
      const partialConfig = {
        mainBranch: 'develop'
      };
      
      await fs.writeJSON('.worktree-config.json', partialConfig);
      
      const result = await config.load();
      
      // Should have default values for missing fields
      expect(result).toMatchObject({
        baseDir: '.worktrees',
        portRanges: {
          vite: { start: 3000, increment: 10 },
          storybook: { start: 6006, increment: 10 },
          custom: { start: 8000, increment: 10 }
        },
        mainBranch: 'develop', // From file
        namePattern: '{branch}', // From defaults
        autoCleanup: true
      });
      expect(config.config).toEqual(result);
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
        namePattern: '{branch}'
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
        namePattern: '{branch}'
      };
      
      await fs.writeJSON('.worktree-config.json', existingConfig);
      
      const result = await config.init();
      
      // Should include defaults merged with existing config
      expect(result).toMatchObject(existingConfig);
      expect(result.autoCleanup).toBe(true); // From defaults
      expect(result.prompts).toBeDefined(); // From defaults
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
      
      await expect(config.save()).rejects.toThrow('Configuration hasn\'t been loaded yet');
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
        namePattern: '{branch}'
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
      
      expect(() => config.get()).toThrow('Configuration hasn\'t been loaded yet');
    });
  });

  describe('getWorktreeName', () => {
    test('applies name pattern correctly', async () => {
      await config.init();
      
      const name = config.getWorktreeName('feature-auth-system');
      
      expect(name).toBe('feature-auth-system');
    });

    test('handles branch names with slashes', async () => {
      await config.init();
      
      const name = config.getWorktreeName('feature/auth-system');
      
      expect(name).toBe('feature/auth-system');
    });

    test('uses default namePattern when missing from config file', async () => {
      // This is the exact scenario the user encountered
      await fs.writeJSON('.worktree-config.json', {
        mainBranch: 'develop'
        // namePattern is missing!
      });
      
      await config.load();
      const name = config.getWorktreeName('ugh');
      
      // Should use the default pattern '{branch}', not 'wt-{branch}'
      expect(name).toBe('ugh');
    });

    test('throws when config not loaded', () => {
      config.config = null;
      
      expect(() => config.getWorktreeName('feature')).toThrow('Configuration hasn\'t been loaded yet');
    });
  });

  describe('getWorktreePath', () => {
    test('returns correct worktree path', async () => {
      await config.init();
      
      const result = config.getWorktreePath('feature', tempDir);
      
      expect(result).toBe(path.join(tempDir, '.worktrees', 'feature'));
    });

    test('uses current directory as default', async () => {
      await config.init();
      
      const result = config.getWorktreePath('feature');
      
      expect(result).toBe(path.join(tempDir, '.worktrees', 'feature'));
    });

    test('throws when config not loaded', () => {
      config.config = null;
      
      expect(() => config.getWorktreePath('feature')).toThrow('Configuration hasn\'t been loaded yet');
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
      
      expect(() => config.getBaseDir()).toThrow('Configuration hasn\'t been loaded yet');
    });
  });
});