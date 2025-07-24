const { expect } = require('chai');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const rootFinder = require('../lib/rootFinder');

describe('RootFinder', () => {
  let tempDir;

  beforeEach(async () => {
    // Create a temporary directory for testing with random suffix
    tempDir = path.join(os.tmpdir(), `wtt-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('findGitRoot', () => {
    it('should find main repository when .git is a directory', async () => {
      // Create a fake git repository structure
      const repoPath = path.join(tempDir, 'main-repo');
      const gitPath = path.join(repoPath, '.git');
      await fs.mkdir(repoPath, { recursive: true });
      await fs.mkdir(gitPath, { recursive: true });

      const result = await rootFinder.findGitRoot(repoPath);
      
      expect(result).to.deep.equal({
        path: repoPath,
        gitDir: gitPath,
        isWorktree: false
      });
    });

    it('should find worktree when .git is a file', async () => {
      // Create a fake worktree structure
      const mainRepo = path.join(tempDir, 'main-repo');
      const worktreePath = path.join(tempDir, 'worktree');
      const mainGitPath = path.join(mainRepo, '.git', 'worktrees', 'feature');
      
      await fs.mkdir(mainRepo, { recursive: true });
      await fs.mkdir(worktreePath, { recursive: true });
      await fs.mkdir(mainGitPath, { recursive: true });
      
      // Create .git file pointing to worktree git dir
      const gitFileContent = `gitdir: ${mainGitPath}`;
      await fs.writeFile(path.join(worktreePath, '.git'), gitFileContent);

      const result = await rootFinder.findGitRoot(worktreePath);
      
      expect(result).to.deep.equal({
        path: worktreePath,
        gitDir: mainGitPath,
        isWorktree: true
      });
    });

    it('should handle relative paths in .git file', async () => {
      // Create a fake worktree with relative path
      const worktreePath = path.join(tempDir, 'worktree');
      const relativePath = '../main-repo/.git/worktrees/feature';
      const expectedGitDir = path.join(tempDir, 'main-repo', '.git', 'worktrees', 'feature');
      
      await fs.mkdir(worktreePath, { recursive: true });
      await fs.mkdir(expectedGitDir, { recursive: true });
      
      // Create .git file with relative path
      await fs.writeFile(path.join(worktreePath, '.git'), `gitdir: ${relativePath}`);

      const result = await rootFinder.findGitRoot(worktreePath);
      
      expect(result.isWorktree).to.be.true;
      expect(result.gitDir).to.equal(expectedGitDir);
    });

    it('should find git root from subdirectory', async () => {
      // Create repo with subdirectories
      const repoPath = path.join(tempDir, 'repo');
      const subDir = path.join(repoPath, 'src', 'components');
      const gitPath = path.join(repoPath, '.git');
      
      await fs.mkdir(subDir, { recursive: true });
      await fs.mkdir(gitPath, { recursive: true });

      const result = await rootFinder.findGitRoot(subDir);
      
      expect(result).to.deep.equal({
        path: repoPath,
        gitDir: gitPath,
        isWorktree: false
      });
    });

    it('should return null when no git repository found', async () => {
      const nonGitDir = path.join(tempDir, 'not-a-repo');
      await fs.mkdir(nonGitDir, { recursive: true });

      const result = await rootFinder.findGitRoot(nonGitDir);
      
      expect(result).to.be.null;
    });
  });

  describe('findMainRepository', () => {
    it('should find main repo from standard worktree git directory', async () => {
      const mainRepoPath = path.join(tempDir, 'main-repo');
      const worktreeGitDir = path.join(mainRepoPath, '.git', 'worktrees', 'feature');
      const mainGitDir = path.join(mainRepoPath, '.git');
      
      await fs.mkdir(worktreeGitDir, { recursive: true });
      await fs.mkdir(mainGitDir, { recursive: true });

      const result = await rootFinder.findMainRepository(worktreeGitDir);
      
      expect(result).to.equal(mainRepoPath);
    });

    it('should find main repo using commondir file', async () => {
      const mainRepoPath = path.join(tempDir, 'main-repo');
      const worktreeGitDir = path.join(tempDir, 'custom-location', 'git-dir');
      const mainGitDir = path.join(mainRepoPath, '.git');
      
      await fs.mkdir(worktreeGitDir, { recursive: true });
      await fs.mkdir(mainGitDir, { recursive: true });
      
      // Create commondir file pointing to main .git
      await fs.writeFile(path.join(worktreeGitDir, 'commondir'), mainGitDir);

      const result = await rootFinder.findMainRepository(worktreeGitDir);
      
      expect(result).to.equal(mainRepoPath);
    });

    it('should handle relative paths in commondir', async () => {
      const mainRepoPath = path.join(tempDir, 'main-repo');
      const worktreeGitDir = path.join(tempDir, 'worktrees', 'feature', '.git');
      const mainGitDir = path.join(mainRepoPath, '.git');
      
      await fs.mkdir(worktreeGitDir, { recursive: true });
      await fs.mkdir(mainGitDir, { recursive: true });
      
      // Create commondir with relative path
      const relativePath = '../../../main-repo/.git';
      await fs.writeFile(path.join(worktreeGitDir, 'commondir'), relativePath);

      const result = await rootFinder.findMainRepository(worktreeGitDir);
      
      expect(result).to.equal(mainRepoPath);
    });

    it('should throw error when main repository cannot be determined', async () => {
      const invalidGitDir = path.join(tempDir, 'invalid-git');
      await fs.mkdir(invalidGitDir, { recursive: true });

      try {
        await rootFinder.findMainRepository(invalidGitDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Could not determine main repository location');
      }
    });
  });

  describe('findRoot', () => {
    it('should return main repo info when in main repository', async () => {
      const repoPath = path.join(tempDir, 'main-repo');
      const gitPath = path.join(repoPath, '.git');
      await fs.mkdir(repoPath, { recursive: true });
      await fs.mkdir(gitPath, { recursive: true });

      const result = await rootFinder.findRoot(repoPath);
      
      expect(result).to.deep.equal({
        root: repoPath,
        isWorktree: false
      });
    });

    it('should return main repo info when in worktree', async () => {
      // Create complete worktree structure
      const mainRepo = path.join(tempDir, 'main-repo');
      const worktreeName = 'feature-branch';
      const worktreePath = path.join(tempDir, 'worktrees', worktreeName);
      const mainGitPath = path.join(mainRepo, '.git');
      const worktreeGitPath = path.join(mainGitPath, 'worktrees', worktreeName);
      
      // Create all directories
      await fs.mkdir(mainRepo, { recursive: true });
      await fs.mkdir(worktreePath, { recursive: true });
      await fs.mkdir(mainGitPath, { recursive: true });
      await fs.mkdir(worktreeGitPath, { recursive: true });
      
      // Create .git file in worktree
      await fs.writeFile(path.join(worktreePath, '.git'), `gitdir: ${worktreeGitPath}`);

      const result = await rootFinder.findRoot(worktreePath);
      
      expect(result).to.deep.equal({
        root: mainRepo,
        isWorktree: true,
        worktreeName: worktreeName,
        currentWorktreePath: worktreePath
      });
    });

    it('should throw error when not in a git repository', async () => {
      const nonGitDir = path.join(tempDir, 'not-a-repo');
      await fs.mkdir(nonGitDir, { recursive: true });

      try {
        await rootFinder.findRoot(nonGitDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Not in a git repository');
      }
    });
  });

  describe('findConfigFile', () => {
    it('should find config file in current directory', async () => {
      const repoPath = path.join(tempDir, 'repo');
      const configPath = path.join(repoPath, '.worktree-config.json');
      
      await fs.mkdir(repoPath, { recursive: true });
      await fs.writeFile(configPath, '{}');

      const result = await rootFinder.findConfigFile(repoPath);
      
      expect(result).to.equal(configPath);
    });

    it('should find config file in parent directory', async () => {
      const repoPath = path.join(tempDir, 'repo');
      const subDir = path.join(repoPath, 'src', 'lib');
      const configPath = path.join(repoPath, '.worktree-config.json');
      
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(configPath, '{}');

      const result = await rootFinder.findConfigFile(subDir);
      
      expect(result).to.equal(configPath);
    });

    it('should return null when config file not found', async () => {
      const dirPath = path.join(tempDir, 'no-config');
      await fs.mkdir(dirPath, { recursive: true });
      
      // Ensure no config file exists in the path or any parent
      const result = await rootFinder.findConfigFile(dirPath);
      
      expect(result).to.be.null;
    });
  });

  describe('getMainRepoRoot', () => {
    it('should return main repo root from any location', async () => {
      // Create main repo
      const mainRepo = path.join(tempDir, 'main');
      const mainGit = path.join(mainRepo, '.git');
      await fs.mkdir(mainRepo, { recursive: true });
      await fs.mkdir(mainGit, { recursive: true });

      // Test from main repo
      let result = await rootFinder.getMainRepoRoot(mainRepo);
      expect(result).to.equal(mainRepo);

      // Test from subdirectory
      const subDir = path.join(mainRepo, 'src');
      await fs.mkdir(subDir, { recursive: true });
      result = await rootFinder.getMainRepoRoot(subDir);
      expect(result).to.equal(mainRepo);

      // Create and test from worktree
      const worktreePath = path.join(tempDir, 'worktree');
      const worktreeGitDir = path.join(mainGit, 'worktrees', 'feature');
      await fs.mkdir(worktreePath, { recursive: true });
      await fs.mkdir(worktreeGitDir, { recursive: true });
      await fs.writeFile(path.join(worktreePath, '.git'), `gitdir: ${worktreeGitDir}`);
      
      result = await rootFinder.getMainRepoRoot(worktreePath);
      expect(result).to.equal(mainRepo);
    });
  });
});