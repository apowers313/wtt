const { execSync } = require('child_process');
const os = require('os');

/**
 * Helper utilities for shell detection and testing
 */
class ShellDetection {
  /**
   * Get the default shell for the current platform
   */
  static getDefaultShell() {
    if (process.platform === 'win32') {
      // On Windows, prefer PowerShell, fall back to cmd.exe
      const shells = this.getAvailableWindowsShells();
      return shells.powershell || shells.pwsh || shells.cmd || 'cmd.exe';
    } else {
      // On Unix-like systems, use SHELL env var or defaults
      return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    }
  }

  /**
   * Check if a shell command exists
   */
  static commandExists(command) {
    try {
      if (process.platform === 'win32') {
        execSync(`where ${command}`, { stdio: 'pipe' });
      } else {
        execSync(`which ${command}`, { stdio: 'pipe' });
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get available shells on Windows
   */
  static getAvailableWindowsShells() {
    const shells = {
      powershell: null,
      pwsh: null,
      cmd: null
    };

    // Check for Windows PowerShell
    if (this.commandExists('powershell.exe')) {
      shells.powershell = 'powershell.exe';
    }

    // Check for PowerShell Core
    if (this.commandExists('pwsh.exe')) {
      shells.pwsh = 'pwsh.exe';
    } else if (this.commandExists('pwsh')) {
      shells.pwsh = 'pwsh';
    }

    // cmd.exe should always be available on Windows
    shells.cmd = 'cmd.exe';

    return shells;
  }

  /**
   * Get available shells on Unix-like systems
   */
  static getAvailableUnixShells() {
    const shells = {
      bash: null,
      zsh: null,
      fish: null,
      sh: null
    };

    if (this.commandExists('bash')) {
      shells.bash = '/bin/bash';
    } else if (this.commandExists('/usr/bin/bash')) {
      shells.bash = '/usr/bin/bash';
    }

    if (this.commandExists('zsh')) {
      shells.zsh = '/bin/zsh';
    } else if (this.commandExists('/usr/bin/zsh')) {
      shells.zsh = '/usr/bin/zsh';
    }

    if (this.commandExists('fish')) {
      shells.fish = '/usr/bin/fish';
    }

    // sh should always be available
    shells.sh = '/bin/sh';

    return shells;
  }

  /**
   * Get all available shells for the current platform
   */
  static getAvailableShells() {
    if (process.platform === 'win32') {
      return this.getAvailableWindowsShells();
    } else {
      return this.getAvailableUnixShells();
    }
  }

  /**
   * Get shell-specific environment variables to ensure clean test environment
   */
  static getCleanEnvironment(shellType) {
    const cleanEnv = {
      ...process.env,
      // Disable shell initialization files that might interfere
      BASH_ENV: '',
      ENV: '',
      // Use temp directory for zsh config
      ZDOTDIR: os.tmpdir()
    };

    if (process.platform === 'win32') {
      // Disable PowerShell profiles and telemetry
      cleanEnv.POWERSHELL_TELEMETRY_OPTOUT = '1';
      cleanEnv.PSModulePath = '';
      cleanEnv.POWERSHELL_UPDATECHECK = 'Off';
      
      // Disable loading profiles
      if (shellType === 'powershell' || shellType === 'pwsh') {
        // These will be passed as arguments instead
      }
    }

    return cleanEnv;
  }

  /**
   * Get shell-specific arguments for testing
   */
  static getShellArgs(shellType) {
    const args = [];

    if (shellType === 'powershell' || shellType === 'pwsh') {
      // Disable profiles and set execution policy
      args.push('-NoProfile', '-NonInteractive');
    } else if (shellType === 'bash') {
      // Disable startup files
      args.push('--norc', '--noprofile');
    } else if (shellType === 'zsh') {
      // Disable startup files
      args.push('--no-rcs');
    }

    return args;
  }

  /**
   * Detect if running in CI environment
   */
  static isCI() {
    return !!(
      process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.TRAVIS ||
      process.env.CIRCLECI ||
      process.env.JENKINS_URL ||
      process.env.GITLAB_CI ||
      process.env.BUILDKITE ||
      process.env.DRONE ||
      process.env.BITBUCKET_BUILD_NUMBER
    );
  }

  /**
   * Get appropriate timeout for current environment
   */
  static getTestTimeout() {
    if (this.isCI()) {
      return 5000; // 5 seconds in CI
    }
    return 10000; // 10 seconds locally
  }

  /**
   * Get appropriate prompt wait time
   */
  static getPromptWait() {
    if (this.isCI()) {
      return 200; // 200ms in CI
    }
    return 500; // 500ms locally
  }
}

module.exports = ShellDetection;