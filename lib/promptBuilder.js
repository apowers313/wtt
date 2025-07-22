const os = require('os');

// Template variables documentation:
// {worktree} - Worktree name
// {branch} - Current git branch
// {cwd} - Current working directory (with ~ for home)
// {pwd} - Current working directory (full path)
// {dirty} - Git dirty indicator (✗ if dirty, empty otherwise)
// {dirty:text} - Shows "text" if dirty, empty otherwise
// {user} - Current username
// {host} - Hostname
// {time} - Current time (HH:MM:SS)
// {date} - Current date (YYYY-MM-DD)
// {port:service} - Port for a specific service (e.g., {port:vite})
// {exitcode} - Exit code of last command
// Color codes vary by shell type

class PromptBuilder {
  constructor(shellType, worktreeName, worktreePath, ports = {}) {
    this.shellType = shellType;
    this.worktreeName = worktreeName;
    this.worktreePath = worktreePath;
    this.ports = ports;
    this.colorMap = this.getColorMap(shellType);
  }

  getColorMap(shellType) {
    switch (shellType) {
    case 'bash':
      return {
        red: '\\[\\033[1;31m\\]',
        green: '\\[\\033[1;32m\\]',
        yellow: '\\[\\033[1;33m\\]',
        blue: '\\[\\033[1;34m\\]',
        purple: '\\[\\033[1;35m\\]',
        magenta: '\\[\\033[1;35m\\]',
        cyan: '\\[\\033[1;36m\\]',
        white: '\\[\\033[1;37m\\]',
        reset: '\\[\\033[0m\\]',
        normal: '\\[\\033[0m\\]'
      };
    case 'zsh':
      return {
        red: '%F{red}',
        green: '%F{green}',
        yellow: '%F{yellow}',
        blue: '%F{blue}',
        purple: '%F{magenta}',
        magenta: '%F{magenta}',
        cyan: '%F{cyan}',
        white: '%F{white}',
        reset: '%f',
        normal: '%f'
      };
    case 'fish':
      return {
        red: '(set_color red)',
        green: '(set_color green)',
        yellow: '(set_color yellow)',
        blue: '(set_color blue)',
        purple: '(set_color magenta)',
        magenta: '(set_color magenta)',
        cyan: '(set_color cyan)',
        white: '(set_color white)',
        reset: '(set_color normal)',
        normal: '(set_color normal)'
      };
    case 'powershell':
    case 'pwsh':
    case 'powershell.exe':
    case 'pwsh.exe':
      // PowerShell uses a different approach - these are placeholders
      return {
        red: '{red}',
        green: '{green}',
        yellow: '{yellow}',
        blue: '{blue}',
        purple: '{magenta}',
        magenta: '{magenta}',
        cyan: '{cyan}',
        white: '{white}',
        reset: '{reset}',
        normal: '{reset}'
      };
    default:
      return {
        red: '',
        green: '',
        yellow: '',
        blue: '',
        purple: '',
        magenta: '',
        cyan: '',
        white: '',
        reset: '',
        normal: ''
      };
    }
  }

  buildPrompt(template) {
    let prompt = template;
    
    // Replace color codes
    Object.entries(this.colorMap).forEach(([name, code]) => {
      prompt = prompt.replace(new RegExp(`\\{${name}\\}`, 'g'), code);
    });
    
    // Replace template variables
    prompt = prompt.replace(/\{worktree\}/g, this.worktreeName);
    prompt = prompt.replace(/\{user\}/g, os.userInfo().username);
    prompt = prompt.replace(/\{host\}/g, os.hostname());
    
    // Handle shell-specific dynamic values
    switch (this.shellType) {
    case 'bash':
      prompt = prompt.replace(/\{branch\}/g, '\\$(git branch 2>/dev/null | grep "^*" | colrm 1 2)');
      prompt = prompt.replace(/\{cwd\}/g, '\\w');
      prompt = prompt.replace(/\{pwd\}/g, '\\$(pwd)');
      prompt = prompt.replace(/\{dirty\}/g, '\\$(git status -s 2>/dev/null | grep -q . && echo "✗")');
      prompt = prompt.replace(/\{dirty:([^}]+)\}/g, '\\$(git status -s 2>/dev/null | grep -q . && echo "$1")');
      prompt = prompt.replace(/\{time\}/g, '\\$(date +%H:%M:%S)');
      prompt = prompt.replace(/\{date\}/g, '\\$(date +%Y-%m-%d)');
      prompt = prompt.replace(/\{exitcode\}/g, '$?');
      break;
        
    case 'zsh':
      prompt = prompt.replace(/\{branch\}/g, '$(git branch 2>/dev/null | grep "^*" | colrm 1 2)');
      prompt = prompt.replace(/\{cwd\}/g, '%~');
      prompt = prompt.replace(/\{pwd\}/g, '%d');
      prompt = prompt.replace(/\{dirty\}/g, '$(git status -s 2>/dev/null | grep -q . && echo "✗")');
      prompt = prompt.replace(/\{dirty:([^}]+)\}/g, '$(git status -s 2>/dev/null | grep -q . && echo "$1")');
      prompt = prompt.replace(/\{time\}/g, '%T');
      prompt = prompt.replace(/\{date\}/g, '%D');
      prompt = prompt.replace(/\{exitcode\}/g, '%?');
      break;
        
    case 'fish':
      prompt = prompt.replace(/\{branch\}/g, '(git branch 2>/dev/null | grep "^*" | colrm 1 2)');
      prompt = prompt.replace(/\{cwd\}/g, '(prompt_pwd)');
      prompt = prompt.replace(/\{pwd\}/g, '(pwd)');
      prompt = prompt.replace(/\{dirty\}/g, '(git status -s 2>/dev/null | grep -q . && echo "✗")');
      prompt = prompt.replace(/\{dirty:([^}]+)\}/g, '(git status -s 2>/dev/null | grep -q . && echo "$1")');
      prompt = prompt.replace(/\{time\}/g, '(date +%H:%M:%S)');
      prompt = prompt.replace(/\{date\}/g, '(date +%Y-%m-%d)');
      prompt = prompt.replace(/\{exitcode\}/g, '$status');
      break;
        
    case 'powershell':
    case 'pwsh':
    case 'powershell.exe':
    case 'pwsh.exe':
      // PowerShell templates are handled differently in the switch command
      prompt = prompt.replace(/\{branch\}/g, '$branch');
      prompt = prompt.replace(/\{cwd\}/g, '$currentPath');
      prompt = prompt.replace(/\{pwd\}/g, '$(Get-Location).Path');
      prompt = prompt.replace(/\{dirty\}/g, '$dirtyText');
      prompt = prompt.replace(/\{dirty:([^}]+)\}/g, '$dirtyCustom');
      prompt = prompt.replace(/\{time\}/g, '$(Get-Date -Format "HH:mm:ss")');
      prompt = prompt.replace(/\{date\}/g, '$(Get-Date -Format "yyyy-MM-dd")');
      prompt = prompt.replace(/\{exitcode\}/g, '$LASTEXITCODE');
      break;
        
    default:
      // Basic replacements for unknown shells
      prompt = prompt.replace(/\{branch\}/g, '');
      prompt = prompt.replace(/\{cwd\}/g, '\\w');
      prompt = prompt.replace(/\{pwd\}/g, '');
      prompt = prompt.replace(/\{dirty\}/g, '');
      prompt = prompt.replace(/\{dirty:[^}]+\}/g, '');
      prompt = prompt.replace(/\{time\}/g, '');
      prompt = prompt.replace(/\{date\}/g, '');
      prompt = prompt.replace(/\{exitcode\}/g, '');
    }
    
    // Replace port variables
    Object.entries(this.ports).forEach(([service, port]) => {
      prompt = prompt.replace(new RegExp(`\\{port:${service}\\}`, 'g'), port);
    });
    
    // Remove any remaining unmatched port variables
    prompt = prompt.replace(/\{port:[^}]+\}/g, '');
    
    return prompt;
  }
}

module.exports = PromptBuilder;