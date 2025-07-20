const PathUtils = require('./pathUtils');

/**
 * Parser for git command outputs that handles platform differences
 */
class GitOutputParser {
  /**
   * Parse git worktree list output
   * @param {string} output - Raw output from git worktree list
   * @returns {Array} Parsed worktree objects
   */
  static parseWorktreeList(output) {
    if (!output || !output.trim()) {
      return [];
    }

    // Split by line, handling both Unix and Windows line endings
    const lines = output.split(/\r?\n/).filter(line => line.trim());
    
    return lines.map(line => {
      // Git worktree list format: <path> <commit> [<branch>]
      // The commit hash is always a 40-char hex string (or abbreviated)
      // We need to find it to properly split the path (which may contain spaces)
      
      // Look for the commit hash pattern (7-40 hex characters preceded by space)
      const commitMatch = line.match(/\s+([a-f0-9]{7,40})(\s+|$)/i);
      if (!commitMatch) return null;
      
      const commitIndex = line.indexOf(commitMatch[0]);
      const worktreePath = line.substring(0, commitIndex).trim();
      const commit = commitMatch[1];
      const afterCommit = line.substring(commitIndex + commitMatch[0].length).trim();
      
      // Normalize the path for consistent handling
      const normalizedPath = PathUtils.normalize(worktreePath);
      
      // Extract branch name and status from the rest of the line
      let branch = '';
      let bare = false;
      let detached = false;
      
      if (afterCommit.includes('(bare)')) {
        bare = true;
      } else if (afterCommit.includes('(detached HEAD)')) {
        detached = true;
      } else {
        // Extract branch name from brackets
        const branchMatch = afterCommit.match(/\[([^\]]+)\]/);
        if (branchMatch) {
          branch = branchMatch[1];
        }
      }

      return {
        path: normalizedPath,
        commit,
        branch,
        bare,
        detached
      };
    }).filter(wt => wt !== null);
  }

  /**
   * Parse git status output for uncommitted changes
   * @param {string} output - Raw output from git status
   * @returns {boolean} True if there are uncommitted changes
   */
  static hasUncommittedChanges(output) {
    if (!output) return false;
    
    // Normalize line endings
    const normalizedOutput = output.replace(/\r\n/g, '\n');
    
    // Check for various indicators of uncommitted changes
    const indicators = [
      'Changes not staged for commit',
      'Changes to be committed',
      'Untracked files',
      'Your branch is ahead',
      'modified:',
      'new file:',
      'deleted:'
    ];
    
    return indicators.some(indicator => 
      normalizedOutput.includes(indicator)
    );
  }

  /**
   * Parse git branch output
   * @param {string} output - Raw output from git branch
   * @returns {Array<string>} List of branch names
   */
  static parseBranchList(output) {
    if (!output || !output.trim()) {
      return [];
    }

    const lines = output.split(/\r?\n/).filter(line => line.trim());
    
    return lines.map(line => {
      // Remove the * for current branch and trim
      return line.replace(/^\*?\s+/, '').trim();
    }).filter(branch => branch.length > 0);
  }

  /**
   * Parse git remote output for unpushed commits
   * @param {string} output - Raw output from git log origin..HEAD
   * @returns {boolean} True if there are unpushed commits
   */
  static hasUnpushedCommits(output) {
    // If there's any output, there are unpushed commits
    return output && output.trim().length > 0;
  }

  /**
   * Normalize git command output for cross-platform consistency
   * @param {string} output - Raw git output
   * @returns {string} Normalized output
   */
  static normalizeOutput(output) {
    if (!output) return '';
    
    // Normalize line endings
    let normalized = output.replace(/\r\n/g, '\n');
    
    // Trim trailing whitespace from each line
    normalized = normalized.split('\n')
      .map(line => line.trimEnd())
      .join('\n');
    
    return normalized.trim();
  }
}

module.exports = GitOutputParser;