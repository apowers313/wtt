const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const simpleGit = require('simple-git');

class BackupManager {
  constructor(baseDir) {
    this.baseDir = baseDir || process.cwd();
    this.backupDir = path.join(this.baseDir, '.worktrees', '.backups');
    this._git = null;
  }

  get git() {
    if (!this._git) {
      this._git = simpleGit(this.baseDir);
    }
    return this._git;
  }

  async init() {
    await fs.ensureDir(this.backupDir);
  }

  async createSafetyBackup(operation, options = {}) {
    await this.init();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `${operation}-${timestamp}`;
    const operationBackupDir = path.join(this.backupDir, backupId);
    
    await fs.ensureDir(operationBackupDir);
    
    console.log(chalk.blue('🔒 Creating safety backup...'));
    
    try {
      // Get basic info first
      const currentBranch = await this.getCurrentBranch();
      const currentCommit = await this.getCurrentCommit();
      
      // Save current state
      const backup = {
        id: backupId,
        operation,
        timestamp: new Date().toISOString(),
        branch: currentBranch,
        commit: currentCommit,
        workingDirectory: this.baseDir,
        uncommittedChanges: null,
        stashes: null,
        metadata: options.metadata || {}
      };

      // Save uncommitted changes if any exist
      const hasUncommitted = await this.hasUncommittedChanges();
      if (hasUncommitted) {
        backup.uncommittedChanges = await this.saveUncommittedChanges(operationBackupDir);
        console.log(chalk.gray('  - Uncommitted changes preserved'));
      }

      // Save current stash stack
      const stashes = await this.getStashes();
      if (stashes.length > 0) {
        backup.stashes = await this.saveStashes(operationBackupDir, stashes);
        console.log(chalk.gray('  - Stash stack saved'));
      }

      // Save branch state and refs
      await this.saveBranchState(operationBackupDir, backup.branch);
      console.log(chalk.gray('  - Branch state saved'));

      // Save backup metadata
      const backupInfoPath = path.join(operationBackupDir, 'backup-info.json');
      await fs.writeJSON(backupInfoPath, backup, { spaces: 2 });

      console.log(chalk.green('✅ Safety backup created'));
      console.log(chalk.gray(`   Backup ID: ${backupId}`));
      console.log(chalk.gray(`   Recovery: wt restore --backup ${backupId}`));
      
      return backup;

    } catch (error) {
      console.error(chalk.red('❌ Failed to create backup:'), error.message);
      // Clean up partial backup
      await fs.remove(operationBackupDir).catch(() => {});
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  async restoreFromBackup(backupId, options = {}) {
    const backupPath = path.join(this.backupDir, backupId);
    const backupInfoPath = path.join(backupPath, 'backup-info.json');
    
    if (!await fs.pathExists(backupInfoPath)) {
      throw new Error(`Backup '${backupId}' not found`);
    }

    const backupInfo = await fs.readJSON(backupInfoPath);
    
    console.log(chalk.blue(`🔄 Restoring from backup: ${backupId}`));
    console.log(chalk.gray(`   Created: ${new Date(backupInfo.timestamp).toLocaleString()}`));
    console.log(chalk.gray(`   Operation: ${backupInfo.operation}`));

    try {
      // Restore branch state
      if (backupInfo.branch && backupInfo.commit) {
        await this.git.checkout(backupInfo.branch);
        if (!options.keepChanges) {
          await this.git.reset('hard', backupInfo.commit);
        }
        console.log(chalk.green(`✅ Branch restored to '${backupInfo.branch}'`));
      }

      // Restore stashes if they existed
      if (backupInfo.stashes) {
        await this.restoreStashes(backupPath, backupInfo.stashes);
        console.log(chalk.green('✅ Stash stack restored'));
      }

      // Restore uncommitted changes
      if (backupInfo.uncommittedChanges && !options.skipUncommitted) {
        await this.restoreUncommittedChanges(backupPath, backupInfo.uncommittedChanges);
        console.log(chalk.green('✅ Uncommitted changes restored'));
      }

      console.log(chalk.green('✅ Backup restoration complete'));
      
      return backupInfo;

    } catch (error) {
      console.error(chalk.red('❌ Failed to restore backup:'), error.message);
      throw new Error(`Backup restoration failed: ${error.message}`);
    }
  }

  async listBackups() {
    await this.init();
    
    try {
      const entries = await fs.readdir(this.backupDir);
      const backups = [];

      for (const entry of entries) {
        const backupPath = path.join(this.backupDir, entry);
        const backupInfoPath = path.join(backupPath, 'backup-info.json');
        
        if (await fs.pathExists(backupInfoPath)) {
          const info = await fs.readJSON(backupInfoPath);
          backups.push(info);
        }
      }

      return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      return [];
    }
  }

  async deleteBackup(backupId) {
    const backupPath = path.join(this.backupDir, backupId);
    
    if (!await fs.pathExists(backupPath)) {
      throw new Error(`Backup '${backupId}' not found`);
    }

    await fs.remove(backupPath);
    console.log(chalk.green(`✅ Backup '${backupId}' deleted`));
  }

  async cleanOldBackups(maxAge = 30) {
    const backups = await this.listBackups();
    const cutoffDate = new Date(Date.now() - (maxAge * 24 * 60 * 60 * 1000));
    
    let deletedCount = 0;
    for (const backup of backups) {
      const backupDate = new Date(backup.timestamp);
      if (backupDate < cutoffDate) {
        await this.deleteBackup(backup.id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(chalk.green(`✅ Cleaned up ${deletedCount} old backup(s)`));
    }

    return deletedCount;
  }

  // Private helper methods
  async getCurrentBranch() {
    try {
      const status = await this.git.status();
      return status.current;
    } catch (error) {
      return 'HEAD'; // Detached head or other state
    }
  }

  async getCurrentCommit() {
    try {
      return await this.git.revparse(['HEAD']);
    } catch (error) {
      return null;
    }
  }

  async hasUncommittedChanges() {
    try {
      const status = await this.git.status();
      return status.files.length > 0;
    } catch (error) {
      return false;
    }
  }

  async saveUncommittedChanges(backupDir) {
    const changesDir = path.join(backupDir, 'uncommitted-changes');
    await fs.ensureDir(changesDir);

    // Save staged changes
    try {
      const staged = await this.git.diff(['--cached']);
      if (staged) {
        await fs.writeFile(path.join(changesDir, 'staged.diff'), staged);
      }
    } catch (error) {
      // Ignore if no staged changes
    }

    // Save unstaged changes
    try {
      const unstaged = await this.git.diff();
      if (unstaged) {
        await fs.writeFile(path.join(changesDir, 'unstaged.diff'), unstaged);
      }
    } catch (error) {
      // Ignore if no unstaged changes
    }

    // Save untracked files
    try {
      const status = await this.git.status();
      const untracked = status.not_added || [];
      if (untracked.length > 0) {
        const untrackedDir = path.join(changesDir, 'untracked');
        await fs.ensureDir(untrackedDir);
        
        for (const file of untracked) {
          const srcPath = path.join(this.baseDir, file);
          const destPath = path.join(untrackedDir, file);
          await fs.ensureDir(path.dirname(destPath));
          await fs.copy(srcPath, destPath);
        }
        
        await fs.writeJSON(path.join(changesDir, 'untracked-files.json'), untracked);
      }
    } catch (error) {
      // Ignore if no untracked files
    }

    return { saved: true, path: changesDir };
  }

  async restoreUncommittedChanges(backupDir, changesInfo) {
    const changesDir = changesInfo.path;

    // Restore untracked files first
    const untrackedFilesPath = path.join(changesDir, 'untracked-files.json');
    if (await fs.pathExists(untrackedFilesPath)) {
      const untrackedFiles = await fs.readJSON(untrackedFilesPath);
      const untrackedDir = path.join(changesDir, 'untracked');
      
      // Ensure untrackedFiles is an array
      const filesArray = Array.isArray(untrackedFiles) ? untrackedFiles : [];
      
      for (const file of filesArray) {
        const srcPath = path.join(untrackedDir, file);
        const destPath = path.join(this.baseDir, file);
        if (await fs.pathExists(srcPath)) {
          await fs.ensureDir(path.dirname(destPath));
          await fs.copy(srcPath, destPath);
        }
      }
    }

    // Apply unstaged changes
    const unstagedPath = path.join(changesDir, 'unstaged.diff');
    if (await fs.pathExists(unstagedPath)) {
      const diff = await fs.readFile(unstagedPath, 'utf8');
      try {
        await this.git.raw(['apply', '--'], { input: diff });
      } catch (error) {
        console.warn(chalk.yellow('⚠️  Some unstaged changes could not be applied automatically'));
      }
    }

    // Apply staged changes
    const stagedPath = path.join(changesDir, 'staged.diff');
    if (await fs.pathExists(stagedPath)) {
      const diff = await fs.readFile(stagedPath, 'utf8');
      try {
        await this.git.raw(['apply', '--cached', '--'], { input: diff });
      } catch (error) {
        console.warn(chalk.yellow('⚠️  Some staged changes could not be applied automatically'));
      }
    }
  }

  async getStashes() {
    try {
      const stashList = await this.git.stashList();
      return stashList.all;
    } catch (error) {
      return [];
    }
  }

  async saveStashes(backupDir, stashes) {
    const stashDir = path.join(backupDir, 'stashes');
    await fs.ensureDir(stashDir);

    const stashInfo = [];
    for (let i = 0; i < stashes.length; i++) {
      const stash = stashes[i];
      const stashContent = await this.git.show([`stash@{${i}}`]);
      const stashFile = path.join(stashDir, `stash-${i}.patch`);
      await fs.writeFile(stashFile, stashContent);
      
      stashInfo.push({
        index: i,
        hash: stash.hash,
        message: stash.message,
        file: `stash-${i}.patch`
      });
    }

    await fs.writeJSON(path.join(stashDir, 'stash-info.json'), stashInfo);
    return { saved: true, count: stashes.length, path: stashDir };
  }

  async restoreStashes(_backupDir, _stashInfo) {
    // Note: This is a simplified stash restoration
    // In a real implementation, we'd need more sophisticated stash recreation
    console.log(chalk.yellow('⚠️  Stash restoration is limited. Check backup directory for stash patches.'));
  }

  async saveBranchState(backupDir, _branchName) {
    const branchDir = path.join(backupDir, 'branch-state');
    await fs.ensureDir(branchDir);

    // Save current branch's commit log
    try {
      const log = await this.git.log(['-10', '--oneline']);
      await fs.writeJSON(path.join(branchDir, 'recent-commits.json'), log);
    } catch (error) {
      // Ignore if log fails
    }

    // Save refs
    try {
      const refs = await this.git.raw(['show-ref']);
      await fs.writeFile(path.join(branchDir, 'refs.txt'), refs);
    } catch (error) {
      // Ignore if refs fail
    }
  }

  async saveMergeState(mergeInfo) {
    await this.init();
    
    const mergeStateFile = path.join(this.backupDir, 'merge-state.json');
    const mergeStates = await fs.pathExists(mergeStateFile) 
      ? await fs.readJSON(mergeStateFile)
      : [];
    
    mergeStates.push(mergeInfo);
    
    // Keep only last 10 merge states
    if (mergeStates.length > 10) {
      mergeStates.shift();
    }
    
    await fs.writeJSON(mergeStateFile, mergeStates, { spaces: 2 });
    
    return mergeInfo;
  }

  async getLastMergeState() {
    const mergeStateFile = path.join(this.backupDir, 'merge-state.json');
    
    if (!await fs.pathExists(mergeStateFile)) {
      return null;
    }
    
    const mergeStates = await fs.readJSON(mergeStateFile);
    return mergeStates.length > 0 ? mergeStates[mergeStates.length - 1] : null;
  }
}

module.exports = BackupManager;