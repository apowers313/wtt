/**
 * Git command wrapper that ensures no GPG signing
 */

class GitWrapper {
  /**
   * Wrap git command to force no signing
   * @param {string} command - Git command to run
   * @returns {string} Modified command with no-sign flags
   */
  static wrapCommand(command) {
    // Commands that might trigger signing
    const signingCommands = [
      'commit',
      'merge',
      'rebase',
      'cherry-pick',
      'tag -a',
      'tag --annotate'
    ];
    
    // Check if command needs no-sign flag
    const needsNoSign = signingCommands.some(cmd => 
      command.includes(` ${cmd}`) || command.startsWith(`git ${cmd}`)
    );
    
    if (needsNoSign) {
      // Insert --no-gpg-sign flag
      if (command.includes('commit')) {
        return command.replace('commit', 'commit --no-gpg-sign');
      }
      if (command.includes('merge')) {
        return command.replace('merge', 'merge --no-gpg-sign');
      }
      if (command.includes('rebase')) {
        return command.replace('rebase', 'rebase --no-gpg-sign');
      }
      if (command.includes('cherry-pick')) {
        return command.replace('cherry-pick', 'cherry-pick --no-gpg-sign');
      }
      if (command.includes('tag') && (command.includes('-a') || command.includes('--annotate'))) {
        return command.replace('tag', 'tag --no-sign');
      }
    }
    
    return command;
  }

  /**
   * Get environment variables that completely disable signing
   */
  static getNoSignEnvironment(baseEnv = {}) {
    return {
      ...baseEnv,
      // Disable all signing mechanisms
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'commit.gpgsign',
      GIT_CONFIG_VALUE_0: 'false',
      GIT_CONFIG_KEY_1: 'tag.gpgsign', 
      GIT_CONFIG_VALUE_1: 'false',
      // Additional safety
      GPG_AGENT_INFO: '',
      SSH_AUTH_SOCK: '',
      DISPLAY: '',
      GPG_TTY: '',
      GNUPGHOME: '/nonexistent',
    };
  }
}

module.exports = GitWrapper;