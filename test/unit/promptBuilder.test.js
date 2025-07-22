const { expect } = require('chai');
const PromptBuilder = require('../../lib/promptBuilder');
const os = require('os');

describe('PromptBuilder', () => {
  const mockWorktreeName = 'feature-branch';
  const mockWorktreePath = '/home/user/project/.worktrees/feature-branch';
  const mockPorts = {
    vite: 3010,
    storybook: 6016,
    api: 8080
  };

  describe('Bash prompts', () => {
    let builder;

    beforeEach(() => {
      builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, mockPorts);
    });

    it('should handle basic template variables', () => {
      const template = '{worktree} {cwd} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch \\w > ');
    });

    it('should handle color codes', () => {
      const template = '{green}{worktree}{reset} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('\\[\\033[1;32m\\]feature-branch\\[\\033[0m\\] > ');
    });

    it('should handle git branch variable', () => {
      const template = '{worktree} on {branch} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch on \\$(git branch 2>/dev/null | grep "^*" | colrm 1 2) > ');
    });

    it('should handle git dirty status', () => {
      const template = '{worktree}{dirty} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch\\$(git status -s 2>/dev/null | grep -q . && echo "✗") > ');
    });

    it('should handle custom dirty text', () => {
      const template = '{worktree}{dirty:*} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch\\$(git status -s 2>/dev/null | grep -q . && echo "*") > ');
    });

    it('should handle time and date', () => {
      const template = '[{time}] {worktree} [{date}] > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('[\\$(date +%H:%M:%S)] feature-branch [\\$(date +%Y-%m-%d)] > ');
    });

    it('should handle port variables', () => {
      const template = '{worktree} vite:{port:vite} api:{port:api} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch vite:3010 api:8080 > ');
    });

    it('should handle missing port variables', () => {
      const template = '{worktree} {port:unknown} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch  > ');
    });

    it('should handle user and host variables', () => {
      const template = '{user}@{host}:{worktree} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.include(os.userInfo().username);
      expect(result).to.include(os.hostname());
    });

    it('should handle exit code', () => {
      const template = '{worktree} [{exitcode}] > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch [$?] > ');
    });

    it('should handle complex multi-color prompt', () => {
      const template = '{blue}┌─{cyan}{user}@{host} {green}{worktree} {yellow}{branch}{purple}{dirty}\\n{blue}└─{cwd} ▶{reset} ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.include('\\[\\033[1;34m\\]┌─');
      expect(result).to.include('\\[\\033[1;36m\\]');
      expect(result).to.include('\\[\\033[1;32m\\]feature-branch');
      expect(result).to.include('\\n');
      expect(result).to.include('\\[\\033[0m\\]');
    });
  });

  describe('Zsh prompts', () => {
    let builder;

    beforeEach(() => {
      builder = new PromptBuilder('zsh', mockWorktreeName, mockWorktreePath, mockPorts);
    });

    it('should handle basic template variables', () => {
      const template = '{worktree} {cwd} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch %~ > ');
    });

    it('should use zsh color syntax', () => {
      const template = '{green}{worktree}{reset} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('%F{green}feature-branch%f > ');
    });

    it('should handle zsh-specific variables', () => {
      const template = '{worktree} {pwd} {time} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch %d %T > ');
    });

    it('should handle exit code in zsh', () => {
      const template = '{exitcode} {worktree} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('%? feature-branch > ');
    });

    it('should handle git variables in zsh syntax', () => {
      const template = '{branch} {dirty} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.include('$(git branch 2>/dev/null');
      expect(result).to.include('$(git status -s 2>/dev/null');
    });
  });

  describe('Fish prompts', () => {
    let builder;

    beforeEach(() => {
      builder = new PromptBuilder('fish', mockWorktreeName, mockWorktreePath, mockPorts);
    });

    it('should handle basic template variables', () => {
      const template = '{worktree} {cwd} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch (prompt_pwd) > ');
    });

    it('should use fish color syntax', () => {
      const template = '{green}{worktree}{normal} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('(set_color green)feature-branch(set_color normal) > ');
    });

    it('should handle fish-specific variables', () => {
      const template = '{exitcode} {pwd} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('$status (pwd) > ');
    });

    it('should handle git commands in fish syntax', () => {
      const template = '{branch} {dirty} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.include('(git branch 2>/dev/null');
      expect(result).to.include('(git status -s 2>/dev/null');
    });
  });

  describe('PowerShell prompts', () => {
    let builder;

    beforeEach(() => {
      builder = new PromptBuilder('powershell', mockWorktreeName, mockWorktreePath, mockPorts);
    });

    it('should handle basic template variables', () => {
      const template = '{worktree} {cwd} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch $currentPath > ');
    });

    it('should use PowerShell variable placeholders', () => {
      const template = '{branch} {dirty} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('$branch $dirtyText > ');
    });

    it('should handle PowerShell-specific variables', () => {
      const template = '{pwd} {exitcode} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('$(Get-Location).Path $LASTEXITCODE > ');
    });

    it('should handle time in PowerShell format', () => {
      const template = '{time} {date} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('$(Get-Date -Format "HH:mm:ss") $(Get-Date -Format "yyyy-MM-dd") > ');
    });

    it('should use PowerShell color placeholders', () => {
      const template = '{green}{worktree}{reset} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('{green}feature-branch{reset} > ');
    });
  });

  describe('Unknown shell fallback', () => {
    let builder;

    beforeEach(() => {
      builder = new PromptBuilder('unknown-shell', mockWorktreeName, mockWorktreePath, mockPorts);
    });

    it('should provide basic functionality', () => {
      const template = '{worktree} {cwd} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch \\w > ');
    });

    it('should ignore color codes', () => {
      const template = '{green}{worktree}{reset} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch > ');
    });

    it('should skip complex variables', () => {
      const template = '{worktree} {branch} {dirty} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch   > ');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty template', () => {
      const builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, mockPorts);
      const result = builder.buildPrompt('');
      
      expect(result).to.equal('');
    });

    it('should handle template with no variables', () => {
      const builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, mockPorts);
      const result = builder.buildPrompt('$ ');
      
      expect(result).to.equal('$ ');
    });

    it('should handle worktree name with special characters', () => {
      const builder = new PromptBuilder('bash', 'feature/test-123', mockWorktreePath, mockPorts);
      const template = '{worktree} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature/test-123 > ');
    });

    it('should handle undefined ports gracefully', () => {
      const builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, undefined);
      const template = '{worktree} {port:vite} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch  > ');
    });

    it('should handle empty ports object', () => {
      const builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, {});
      const template = '{worktree} {port:vite} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch  > ');
    });

    it('should handle nested color codes', () => {
      const builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, mockPorts);
      const template = '{blue}{green}{worktree}{reset}{reset} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('\\[\\033[1;34m\\]\\[\\033[1;32m\\]feature-branch\\[\\033[0m\\]\\[\\033[0m\\] > ');
    });

    it('should handle multiple occurrences of same variable', () => {
      const builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, mockPorts);
      const template = '{worktree} - {worktree} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch - feature-branch > ');
    });

    it('should handle invalid color names', () => {
      const builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, mockPorts);
      const template = '{invalidcolor}{worktree} > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('{invalidcolor}feature-branch > ');
    });

    it('should preserve whitespace', () => {
      const builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, mockPorts);
      const template = '  {worktree}  >  ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('  feature-branch  >  ');
    });

    it('should handle newlines in template', () => {
      const builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, mockPorts);
      const template = '{worktree}\\n> ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch\\n> ');
    });
  });

  describe('Real-world prompt examples', () => {
    it('should build the default bash prompt correctly', () => {
      const builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, mockPorts);
      const template = '{purple}⚡{green}{worktree}{purple}{dirty} {cyan}{cwd} {blue}▶{reset} ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.include('\\[\\033[1;35m\\]⚡');
      expect(result).to.include('\\[\\033[1;32m\\]feature-branch');
      expect(result).to.include('\\[\\033[1;36m\\]\\w');
      expect(result).to.include('\\[\\033[1;34m\\]▶');
      expect(result).to.include('\\[\\033[0m\\] ');
    });

    it('should build a two-line prompt', () => {
      const builder = new PromptBuilder('zsh', mockWorktreeName, mockWorktreePath, mockPorts);
      const template = '%B%F{blue}╭─%f%F{cyan}{user}@{host} %F{green}{worktree}%f%b\\n%B%F{blue}╰─%f%b ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.include(os.userInfo().username);
      expect(result).to.include(os.hostname());
      expect(result).to.include('feature-branch');
      expect(result).to.include('\\n');
    });

    it('should build a prompt with port information', () => {
      const builder = new PromptBuilder('bash', mockWorktreeName, mockWorktreePath, mockPorts);
      const template = '{worktree} [vite:{port:vite}|sb:{port:storybook}] > ';
      const result = builder.buildPrompt(template);
      
      expect(result).to.equal('feature-branch [vite:3010|sb:6016] > ');
    });
  });
});