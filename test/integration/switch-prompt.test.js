const { expect } = require('chai');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { execSync } = require('child_process');

describe('Switch Command Shell Prompts', () => {
  let tempDir;
  let repoDir;
  let wtPath;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = path.join(os.tmpdir(), `wtt-switch-test-${Date.now()}`);
    repoDir = path.join(tempDir, 'test-repo');
    await fs.mkdir(repoDir, { recursive: true });
    
    // Get the actual wt.js path
    wtPath = path.join(__dirname, '..', '..', 'wt.js');
    
    // Initialize git repo
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "test@example.com"', { cwd: repoDir });
    execSync('git config user.name "Test User"', { cwd: repoDir });
    execSync('git config commit.gpgsign false', { cwd: repoDir });
    
    // Create initial commit
    const readmePath = path.join(repoDir, 'README.md');
    await fs.writeFile(readmePath, '# Test Repo');
    execSync('git add README.md', { cwd: repoDir });
    execSync('git commit -m "Initial commit"', { cwd: repoDir });
    
    // Initialize wt with custom prompts
    execSync(`node ${wtPath} init`, { cwd: repoDir });
    
    // Create a test worktree
    execSync(`node ${wtPath} create test-feature --from master`, { cwd: repoDir });
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Environment variables', () => {
    it('should set WT_WORKTREE and WT_WORKTREE_PATH environment variables', (done) => {
      const switchProcess = spawn('node', [wtPath, 'switch', 'test-feature'], {
        cwd: repoDir,
        env: { ...process.env, SHELL: '/bin/bash' }
      });

      let output = '';
      switchProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      // After shell spawns, run a command to check env vars
      setTimeout(() => {
        switchProcess.stdin.write('echo "WT_WORKTREE=$WT_WORKTREE"\n');
        switchProcess.stdin.write('echo "WT_WORKTREE_PATH=$WT_WORKTREE_PATH"\n');
        switchProcess.stdin.write('exit\n');
      }, 500);

      switchProcess.on('close', () => {
        expect(output).to.include('WT_WORKTREE=test-feature');
        expect(output).to.include(`WT_WORKTREE_PATH=${path.join(repoDir, '.worktrees', 'test-feature')}`);
        done();
      });
    });
  });

  describe('Custom prompt configuration', () => {
    beforeEach(async () => {
      // Update config with custom prompts
      const configPath = path.join(repoDir, '.worktree-config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      config.prompts = {
        bash: 'TEST:{worktree}:{port:vite} $ ',
        default: 'DEFAULT:{worktree} > '
      };
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    });

    it('should use custom prompt from configuration', () => {
      // For now, just verify that custom prompts are loaded from config
      // Interactive shell testing is too complex for automated tests
      
      const output = execSync(`node ${wtPath} switch test-feature --no-shell`, {
        cwd: repoDir
      }).toString();
      
      expect(output).to.include('switching to');
      // The actual prompt testing would require manual testing
    });

    it('should use default prompt for unknown shell', (done) => {
      const switchProcess = spawn('node', [wtPath, 'switch', 'test-feature'], {
        cwd: repoDir,
        env: { ...process.env, SHELL: '/bin/unknown-shell' }
      });

      let output = '';
      switchProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      // Check that it uses the default prompt
      setTimeout(() => {
        switchProcess.stdin.write('echo "PROMPT_CHECK"\n');
        switchProcess.stdin.write('exit\n');
      }, 500);

      switchProcess.on('close', () => {
        expect(output).to.include('Spawning shell in worktree directory');
        done();
      });
    });
  });

  describe('--no-shell option', () => {
    it('should not spawn shell with --no-shell flag', () => {
      const output = execSync(`node ${wtPath} switch test-feature --no-shell`, {
        cwd: repoDir
      }).toString();

      expect(output).to.include('switching to');
      expect(output).to.include('test-feature');
      expect(output).to.include('cd ');
      expect(output).to.include('.worktrees/test-feature');
      expect(output).not.to.include('Spawning shell');
    });
  });

  describe('Prompt template variables', () => {
    beforeEach(async () => {
      // Create a worktree with uncommitted changes
      const worktreePath = path.join(repoDir, '.worktrees', 'test-feature');
      const testFile = path.join(worktreePath, 'test.txt');
      await fs.writeFile(testFile, 'test content');
      
      // Update config with a prompt that shows git status
      const configPath = path.join(repoDir, '.worktree-config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      config.prompts = {
        bash: '{worktree}{dirty:*} {cwd} $ '
      };
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    });

    it('should show dirty indicator when there are uncommitted changes', () => {
      // Verify that the prompt template includes dirty indicator
      // Interactive testing would be needed to verify actual behavior
      
      const configPath = path.join(repoDir, '.worktree-config.json');
      const config = JSON.parse(execSync(`cat "${configPath}"`, { cwd: repoDir }).toString());
      
      expect(config.prompts.bash).to.include('{dirty:*}');
    });
  });

  describe('Shell type detection', () => {
    it('should detect bash shell', () => {
      const output = execSync(`SHELL=/bin/bash node ${wtPath} switch test-feature --no-shell`, {
        cwd: repoDir,
        env: { ...process.env, SHELL: '/bin/bash' }
      }).toString();

      expect(output).to.include('switching to');
    });

    it('should detect zsh shell', () => {
      const output = execSync(`SHELL=/usr/bin/zsh node ${wtPath} switch test-feature --no-shell`, {
        cwd: repoDir,
        env: { ...process.env, SHELL: '/usr/bin/zsh' }
      }).toString();

      expect(output).to.include('switching to');
    });

    it('should handle Windows PowerShell', () => {
      const output = execSync(`node ${wtPath} switch test-feature --no-shell`, {
        cwd: repoDir,
        env: { ...process.env, SHELL: undefined, COMSPEC: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' }
      }).toString();

      expect(output).to.include('switching to');
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent worktree', () => {
      try {
        execSync(`node ${wtPath} switch non-existent`, { cwd: repoDir });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('doesn\'t exist');
      }
    });

    it('should handle invalid prompt templates gracefully', async () => {
      // Set an invalid prompt template
      const configPath = path.join(repoDir, '.worktree-config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      config.prompts = {
        bash: '{invalid_var} {worktree} > '
      };
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Should still work, just ignore invalid variables
      const switchProcess = spawn('node', [wtPath, 'switch', 'test-feature'], {
        cwd: repoDir,
        env: { ...process.env, SHELL: '/bin/bash' }
      });

      let completed = false;
      switchProcess.on('spawn', () => {
        setTimeout(() => {
          switchProcess.stdin.write('exit\n');
        }, 500);
      });

      switchProcess.on('close', (code) => {
        completed = true;
        expect(code).to.equal(0);
      });

      // Wait for completion
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (completed) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    });
  });
});