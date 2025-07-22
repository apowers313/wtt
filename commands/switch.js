const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const config = require('../lib/config');
const portManager = require('../lib/portManager');
const gitOps = require('../lib/gitOps');
const { addCommandContext } = require('../lib/errorTranslator');
const PromptBuilder = require('../lib/promptBuilder');

async function switchCommand(worktreeName, options = {}) {
  try {
    await gitOps.validateRepository();
    await config.load();
    
    await portManager.init(config.getBaseDir());
    
    const worktreePath = config.getWorktreePath(worktreeName);
    
    try {
      await fs.access(worktreePath);
    } catch {
      throw new Error(`Worktree '${worktreeName}' doesn't exist. Use 'wt list' to see available worktrees, or 'wt create ${worktreeName}' to create it`);
    }
    
    console.log(chalk.blue(`Switching to worktree '${worktreeName}'...`));
    console.log(chalk.gray(`Path: ${worktreePath}`));
    
    const ports = portManager.getPorts(worktreeName);
    if (ports) {
      console.log('\n' + chalk.green('Assigned ports:'));
      for (const [service, port] of Object.entries(ports)) {
        const isRunning = await portManager.isPortInUse(port);
        const status = isRunning ? chalk.green(' (running)') : '';
        console.log(chalk.gray(`  ${service}: ${port}${status}`));
      }
    }
    
    const packageJsonPath = path.join(worktreePath, 'package.json');
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      if (packageJson.scripts) {
        console.log('\n' + chalk.green('Available npm scripts:'));
        for (const script of Object.keys(packageJson.scripts)) {
          console.log(chalk.gray(`  npm run ${script}`));
        }
      }
    } catch {
      // package.json doesn't exist or is invalid
    }
    
    if (options.shell === false) {
      // Old behavior: just show cd command
      console.log('\n' + chalk.cyan('To navigate to this worktree:'));
      console.log(chalk.gray(`  cd ${worktreePath}`));
      
      if (process.env.SHELL) {
        console.log('\n' + chalk.yellow('Note: This command cannot change your current directory.'));
        console.log(chalk.yellow('You need to manually run the cd command shown above.'));
      }
    } else {
      // New behavior: spawn a shell
      console.log('\n' + chalk.cyan('Spawning shell in worktree directory...'));
      console.log(chalk.gray('Type "exit" to return to your original directory\n'));
      
      // Spawn a new shell in the worktree directory
      await spawnShell(worktreePath, worktreeName, ports);
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    const context = addCommandContext(error.message, 'switch');
    if (context.tips && context.tips.length > 0) {
      console.error(chalk.yellow('\nTips:'));
      context.tips.forEach(tip => console.error(chalk.gray(`  • ${tip}`)));
    }
    process.exit(1);
  }
}

async function spawnShell(worktreePath, worktreeName, ports = {}) {
  return new Promise((resolve, reject) => {
    // Detect user's shell
    const userShell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/sh');
    const shellName = path.basename(userShell);
    
    // Prepare environment with custom variables
    const env = {
      ...process.env,
      WT_WORKTREE: worktreeName,
      WT_WORKTREE_PATH: worktreePath
    };
    
    // Get configured prompts
    const prompts = config.get().prompts || {};
    const promptTemplate = prompts[shellName] || prompts.default || '[{worktree}]> ';
    
    // Create prompt builder
    const promptBuilder = new PromptBuilder(shellName, worktreeName, worktreePath, ports);
    
    // Prepare shell-specific options and prompt customization
    let shellArgs = [];
    
    switch (shellName) {
    case 'bash': {
      // For bash, use --rcfile to load custom prompt
      const bashPrompt = promptBuilder.buildPrompt(promptTemplate);
      const bashrc = `
# Load original bashrc if it exists
if [ -f ~/.bashrc ]; then
  . ~/.bashrc
fi

# Set custom prompt
export PS1="${bashPrompt}"
`;
        // Create temporary rcfile
      const tmpBashrc = path.join(os.tmpdir(), `wt-bashrc-${Date.now()}`);
      fsSync.writeFileSync(tmpBashrc, bashrc);
      shellArgs = ['--rcfile', tmpBashrc];
        
      // Clean up temp file on exit
      process.on('exit', () => {
        try { fsSync.unlinkSync(tmpBashrc); } catch { /* ignore cleanup errors */ }
      });
      break;
    }
        
    case 'zsh': {
      // For zsh, set PROMPT environment variable
      env.PROMPT = promptBuilder.buildPrompt(promptTemplate);
      break;
    }
        
    case 'fish': {
      // For fish, use --init-command
      const fishPrompt = promptBuilder.buildPrompt(promptTemplate);
      // Fish needs the prompt in a function
      shellArgs = ['--init-command', `
function fish_prompt
    echo -n "${fishPrompt}"
end`];
      break;
    }
        
    case 'powershell.exe':
    case 'pwsh':
    case 'pwsh.exe': {
      // For PowerShell, we need to build a more complex function
      const psTemplate = promptTemplate;
      shellArgs = ['-NoExit', '-Command', buildPowerShellPrompt(psTemplate, worktreeName, worktreePath, ports)];
      break;
    }
        
    default:
      // For other shells, try setting PS1
      env.PS1 = promptBuilder.buildPrompt(promptTemplate);
    }
    
    // Spawn the shell
    const shell = spawn(userShell, shellArgs, {
      cwd: worktreePath,
      env: env,
      stdio: 'inherit',
      shell: false
    });
    
    shell.on('error', (err) => {
      reject(new Error(`Failed to spawn shell: ${err.message}`));
    });
    
    shell.on('exit', (code) => {
      if (code === 0) {
        console.log(chalk.green('\nReturned to original directory'));
        resolve();
      } else {
        resolve(); // Still resolve even on non-zero exit
      }
    });
  });
}

function buildPowerShellPrompt(template, worktreeName, worktreePath, ports) {
  // Build the PowerShell prompt function with proper variable handling
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
  
  // Parse and output colored sections
  promptCode += `
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
  
  return promptCode;
}

module.exports = { switchCommand };