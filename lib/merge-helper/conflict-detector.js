const fs = require('fs').promises;
const gitOps = require('../gitOps');
const { simpleGit } = require('simple-git');

class ConflictDetector {
  constructor() {
    this.git = simpleGit();
  }

  /**
   * Find all files with merge conflicts in the current repository
   */
  async findConflicts() {
    try {
      const status = await this.git.status();
      const conflicts = [];

      // Get conflicted files from git status
      for (const file of status.conflicted) {
        const conflictInfo = await this.analyzeFileConflicts(file);
        conflicts.push({
          file,
          conflicts: conflictInfo.conflicts,
          count: conflictInfo.count,
          type: await this.detectConflictType(file)
        });
      }

      return conflicts;
    } catch (error) {
      throw new Error(`Failed to detect conflicts: ${error.message}`);
    }
  }

  /**
   * Analyze conflicts in a specific file
   */
  async analyzeFileConflicts(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const conflicts = [];
      const lines = content.split('\n');
      
      let inConflict = false;
      let currentConflict = null;
      let lineNumber = 0;

      for (const line of lines) {
        lineNumber++;
        
        if (line.startsWith('<<<<<<<')) {
          inConflict = true;
          currentConflict = {
            startLine: lineNumber,
            ours: [],
            theirs: [],
            separator: null
          };
        } else if (line.startsWith('=======') && inConflict) {
          currentConflict.separator = lineNumber;
        } else if (line.startsWith('>>>>>>>') && inConflict) {
          currentConflict.endLine = lineNumber;
          currentConflict.context = await this.getConflictContext(filePath, currentConflict.startLine);
          conflicts.push(currentConflict);
          inConflict = false;
          currentConflict = null;
        } else if (inConflict && currentConflict) {
          if (currentConflict.separator === null) {
            currentConflict.ours.push(line);
          } else {
            currentConflict.theirs.push(line);
          }
        }
      }

      return {
        conflicts,
        count: conflicts.length
      };
    } catch (error) {
      return {
        conflicts: [],
        count: 0,
        error: error.message
      };
    }
  }

  /**
   * Get context around a conflict (lines before and after)
   */
  async getConflictContext(filePath, conflictLine, contextLines = 3) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      const startLine = Math.max(0, conflictLine - contextLines - 1);
      const endLine = Math.min(lines.length, conflictLine + contextLines);
      
      return {
        before: lines.slice(startLine, conflictLine - 1),
        after: lines.slice(conflictLine, endLine)
      };
    } catch {
      return { before: [], after: [] };
    }
  }

  /**
   * Detect the type of conflict (modify/modify, delete/modify, etc.)
   */
  async detectConflictType(filePath) {
    try {
      // Check if file exists in both branches
      const ourExists = await this.fileExistsInBranch(filePath, 'HEAD');
      const theirExists = await this.fileExistsInBranch(filePath, 'MERGE_HEAD');
      
      if (!ourExists && theirExists) {
        return 'delete/modify';
      } else if (ourExists && !theirExists) {
        return 'modify/delete';
      } else if (await this.isBinaryFile(filePath)) {
        return 'binary';
      } else {
        return 'modify/modify';
      }
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check if a file exists in a specific branch/ref
   */
  async fileExistsInBranch(filePath, ref) {
    try {
      await this.git.show([`${ref}:${filePath}`]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a file is binary
   */
  async isBinaryFile(filePath) {
    try {
      const buffer = await fs.readFile(filePath);
      // Check for null bytes in first 8000 bytes
      const chunk = buffer.slice(0, 8000);
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 0) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Predict potential conflicts before merge
   */
  async predictConflicts(targetBranch) {
    try {
      const currentBranch = await gitOps.getCurrentBranch();
      
      // Get list of files changed in both branches
      const ourChanges = await this.getChangedFiles(currentBranch, targetBranch);
      const theirChanges = await this.getChangedFiles(targetBranch, currentBranch);
      
      // Find files changed in both branches
      const potentialConflicts = [];
      const allFiles = new Set([...ourChanges.keys(), ...theirChanges.keys()]);
      
      for (const file of allFiles) {
        const ourChange = ourChanges.get(file);
        const theirChange = theirChanges.get(file);
        
        if (ourChange && theirChange) {
          // Both branches modified this file
          const risk = await this.assessConflictRisk(file, ourChange, theirChange);
          if (risk.level !== 'none') {
            potentialConflicts.push({
              file,
              risk: risk.level,
              reason: risk.reason,
              ourChange: ourChange.type,
              theirChange: theirChange.type
            });
          }
        }
      }
      
      return potentialConflicts.sort((a, b) => {
        const riskOrder = { high: 0, medium: 1, low: 2 };
        return riskOrder[a.risk] - riskOrder[b.risk];
      });
    } catch (error) {
      throw new Error(`Failed to predict conflicts: ${error.message}`);
    }
  }

  /**
   * Get files changed between two branches
   */
  async getChangedFiles(branch1, branch2) {
    try {
      const diff = await this.git.diff([`${branch2}...${branch1}`, '--name-status']);
      const changes = new Map();
      
      const lines = diff.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const [status, ...pathParts] = line.split('\t');
        const filePath = pathParts.join('\t');
        
        changes.set(filePath, {
          type: this.getChangeType(status),
          status
        });
      }
      
      return changes;
    } catch {
      return new Map();
    }
  }

  /**
   * Convert git status letter to change type
   */
  getChangeType(status) {
    switch (status[0]) {
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'M': return 'modified';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    default: return 'unknown';
    }
  }

  /**
   * Assess the risk of conflict for a file
   */
  async assessConflictRisk(file, ourChange, theirChange) {
    // High risk scenarios
    if (ourChange.type === 'deleted' && theirChange.type === 'modified') {
      return { level: 'high', reason: 'File deleted in one branch but modified in another' };
    }
    if (ourChange.type === 'modified' && theirChange.type === 'deleted') {
      return { level: 'high', reason: 'File modified in one branch but deleted in another' };
    }
    
    // Check if it's a binary file
    if (await this.isBinaryFile(file)) {
      return { level: 'high', reason: 'Binary file modified in both branches' };
    }
    
    // Medium risk for regular modifications
    if (ourChange.type === 'modified' && theirChange.type === 'modified') {
      // Could enhance this by checking if they modified the same lines
      return { level: 'medium', reason: 'File modified in both branches' };
    }
    
    return { level: 'none', reason: '' };
  }

  /**
   * Get statistics about conflicts
   */
  async getConflictStats() {
    const conflicts = await this.findConflicts();
    const stats = {
      totalFiles: conflicts.length,
      totalConflicts: conflicts.reduce((sum, file) => sum + file.count, 0),
      byType: {},
      byFile: {}
    };
    
    for (const conflict of conflicts) {
      // Count by type
      stats.byType[conflict.type] = (stats.byType[conflict.type] || 0) + 1;
      
      // Store per-file info
      stats.byFile[conflict.file] = {
        count: conflict.count,
        type: conflict.type
      };
    }
    
    return stats;
  }
}

module.exports = ConflictDetector;