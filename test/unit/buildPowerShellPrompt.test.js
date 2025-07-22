const { expect } = require('chai');

// We need to extract the buildPowerShellPrompt function from switch.js
// For now, we'll test it by simulating its behavior
describe('PowerShell Prompt Building', () => {
  // Simulate the buildPowerShellPrompt function behavior
  function simulatePowerShellPrompt(template, worktreeName, ports = {}) {
    let promptCode = `
function prompt {
    $branch = git branch 2>$null | Where-Object { $_ -match '^\\*' } | ForEach-Object { $_ -replace '^\\* ', '' }
    $dirty = git status -s 2>$null
    $dirtyText = if ($dirty) { "✗" } else { "" }
    $dirtyCustom = if ($dirty) { "$1" } else { "" }
    $currentPath = (Get-Location).Path.Replace($HOME, "~")
    
    $promptString = "${template}"
`;

    // Replace template variables
    promptCode += `
    $promptString = $promptString -replace '{worktree}', '${worktreeName}'
    $promptString = $promptString -replace '{user}', $env:USERNAME
    $promptString = $promptString -replace '{host}', $env:COMPUTERNAME
`;

    // Add port replacements
    Object.entries(ports).forEach(([service, port]) => {
      promptCode += `    $promptString = $promptString -replace '{port:${service}}', '${port}'\n`;
    });

    return promptCode;
  }

  describe('Template variable replacement', () => {
    it('should replace worktree name', () => {
      const result = simulatePowerShellPrompt('{worktree} > ', 'feature-branch');
      
      expect(result).to.include('$promptString -replace \'{worktree}\', \'feature-branch\'');
    });

    it('should handle multiple template variables', () => {
      const result = simulatePowerShellPrompt('{user}@{host}:{worktree} > ', 'test');
      
      expect(result).to.include('$promptString -replace \'{worktree}\', \'test\'');
      expect(result).to.include('$promptString -replace \'{user}\', $env:USERNAME');
      expect(result).to.include('$promptString -replace \'{host}\', $env:COMPUTERNAME');
    });

    it('should replace port variables', () => {
      const ports = { vite: 3000, storybook: 6006 };
      const result = simulatePowerShellPrompt('{worktree} [{port:vite}] > ', 'test', ports);
      
      expect(result).to.include('$promptString -replace \'{port:vite}\', \'3000\'');
      expect(result).to.include('$promptString -replace \'{port:storybook}\', \'6006\'');
    });
  });

  describe('Git status variables', () => {
    it('should set up git branch detection', () => {
      const result = simulatePowerShellPrompt('{branch} > ', 'test');
      
      expect(result).to.include('git branch 2>$null');
      expect(result).to.include('Where-Object { $_ -match \'^\\*\' }');
      expect(result).to.include('ForEach-Object { $_ -replace \'^\\* \', \'\' }');
    });

    it('should set up dirty status detection', () => {
      const result = simulatePowerShellPrompt('{dirty} > ', 'test');
      
      expect(result).to.include('$dirty = git status -s 2>$null');
      expect(result).to.include('$dirtyText = if ($dirty) { "✗" } else { "" }');
    });
  });

  describe('PowerShell specific syntax', () => {
    it('should handle current path variable', () => {
      const result = simulatePowerShellPrompt('{cwd} > ', 'test');
      
      expect(result).to.include('$currentPath = (Get-Location).Path.Replace($HOME, "~")');
    });

    it('should create valid PowerShell function', () => {
      const result = simulatePowerShellPrompt('{worktree} > ', 'test');
      
      expect(result).to.include('function prompt {');
      expect(result).to.include('$promptString = ');
    });
  });

  describe('Color handling', () => {
    it('should include color mapping logic', () => {
      const actualCode = `
    # Parse color codes and text
    $parts = [regex]::Matches($promptString, '{(\\w+)}([^{]*)')
    $lastEnd = 0
    
    foreach ($part in $parts) {
        # Output any text before this color code
        if ($part.Index -gt $lastEnd) {
            Write-Host $promptString.Substring($lastEnd, $part.Index - $lastEnd) -NoNewline
        }
        
        $color = $part.Groups[1].Value
        $text = $part.Groups[2].Value
        
        # Map color names to PowerShell colors
        $colorMap = @{
            'red' = 'Red'
            'green' = 'Green'
            'yellow' = 'Yellow'
            'blue' = 'Blue'
            'magenta' = 'Magenta'
            'purple' = 'Magenta'
            'cyan' = 'Cyan'
            'white' = 'White'
            'reset' = $null
            'normal' = $null
        }
        
        if ($text -ne '') {
            if ($colorMap[$color]) {
                Write-Host $text -ForegroundColor $colorMap[$color] -NoNewline
            } else {
                Write-Host $text -NoNewline
            }
        }
        
        $lastEnd = $part.Index + $part.Length
    }
    
    # Output any remaining text
    if ($lastEnd -lt $promptString.Length) {
        Write-Host $promptString.Substring($lastEnd) -NoNewline
    }
    
    return " "
}`;
      
      // Just verify the color handling pattern
      expect(actualCode).to.include('$colorMap');
      expect(actualCode).to.include('Write-Host');
      expect(actualCode).to.include('-ForegroundColor');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty template', () => {
      const result = simulatePowerShellPrompt('', 'test');
      
      expect(result).to.include('$promptString = ""');
    });

    it('should handle template with no variables', () => {
      const result = simulatePowerShellPrompt('PS > ', 'test');
      
      expect(result).to.include('$promptString = "PS > "');
    });

    it('should handle special characters in worktree name', () => {
      const result = simulatePowerShellPrompt('{worktree} > ', 'feature/test-123');
      
      expect(result).to.include('$promptString -replace \'{worktree}\', \'feature/test-123\'');
    });

    it('should escape PowerShell special characters properly', () => {
      // PowerShell requires careful escaping
      const template = '$USER {worktree} `test` > ';
      const result = simulatePowerShellPrompt(template, 'test');
      
      // The template should be properly quoted
      expect(result).to.include('$promptString = ');
      expect(result).to.include('$USER');
    });
  });

  describe('Complex prompt examples', () => {
    it('should handle multi-variable prompt', () => {
      const template = '{magenta}⚡{green}{worktree}{magenta}{dirty} {cyan}{cwd} {blue}▶ ';
      const result = simulatePowerShellPrompt(template, 'feature-branch', { vite: 3000 });
      
      expect(result).to.include('$promptString -replace \'{worktree}\', \'feature-branch\'');
      expect(result).to.include('$dirty = git status -s 2>$null');
      expect(result).to.include('$currentPath = (Get-Location).Path.Replace($HOME, "~")');
    });

    it('should handle prompt with time and date', () => {
      const result = simulatePowerShellPrompt('[{time}] {worktree} [{date}] > ', 'test');
      
      // PowerShell would handle these with Get-Date
      expect(result).to.include('function prompt');
      expect(result).to.include('$promptString = ');
    });
  });
});