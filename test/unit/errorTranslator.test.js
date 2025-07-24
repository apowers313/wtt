const { translateGitError, translateFSError, translateJSONError, addCommandContext } = require('../../lib/errorTranslator');
const { expect } = require('chai');

describe('errorTranslator', () => {
  describe('translateGitError', () => {
    it('should handle invalid reference errors', () => {
      const error = new Error('fatal: invalid reference: feature-xyz');
      const result = translateGitError(error);
      expect(result).to.equal('The branch \'feature-xyz\' doesn\'t exist. Try \'wt create feature-xyz --from main\' to create it as a new branch.');
    });

    it('should use custom main branch in error messages', () => {
      const error = new Error('fatal: invalid reference: feature-xyz');
      const result = translateGitError(error, '', 'master');
      expect(result).to.equal('The branch \'feature-xyz\' doesn\'t exist. Try \'wt create feature-xyz --from master\' to create it as a new branch.');
    });

    it('should handle already exists errors', () => {
      const error = new Error('worktree already exists');
      const result = translateGitError(error);
      expect(result).to.equal('A worktree already exists at that location. Use \'wt list\' to see all worktrees.');
    });

    it('should handle branch already checked out errors', () => {
      const error = new Error('\'feature-abc\' is already checked out at /path/to/worktree');
      const result = translateGitError(error);
      expect(result).to.equal('The branch \'feature-abc\' is already being used by another worktree. Each branch can only be used in one worktree at a time.');
    });

    it('should handle locked worktree errors', () => {
      const error = new Error('worktree is locked');
      const result = translateGitError(error);
      expect(result).to.equal('This worktree is locked by another process. Wait a moment and try again, or use --force to override.');
    });

    it('should handle modified or untracked files errors', () => {
      const error = new Error('contains modified or untracked files');
      const result = translateGitError(error);
      expect(result).to.equal('This worktree has unsaved changes. Save or discard your changes first, or use --force to delete anyway.');
    });

    it('should handle not a working tree errors', () => {
      const error = new Error('is not a working tree');
      const result = translateGitError(error);
      expect(result).to.equal('This directory is not a git worktree. Use "wt list" to see valid worktrees.');
    });

    it('should handle CONFLICT errors', () => {
      const error = new Error('CONFLICT (content): Merge conflict in file.js');
      const result = translateGitError(error);
      expect(result).to.equal('There are conflicts in some files that need to be fixed manually. Look for lines marked with <<<<<<<, =======, and >>>>>>> in your files.');
    });

    it('should handle generic CONFLICT without file details', () => {
      const error = new Error('CONFLICT occurred during merge');
      const result = translateGitError(error);
      expect(result).to.equal('There are merge conflicts. Fix the conflicts in your files, then commit the changes.');
    });

    it('should handle local changes would be overwritten errors', () => {
      const error = new Error('Your local changes to the following files would be overwritten');
      const result = translateGitError(error);
      expect(result).to.equal('You have unsaved changes that would be lost. Save or discard your changes before continuing.');
    });

    it('should handle unrelated histories errors', () => {
      const error = new Error('refusing to merge unrelated histories');
      const result = translateGitError(error);
      expect(result).to.equal('These branches don\'t share any common history. This usually means they were created separately. Use --allow-unrelated-histories if you really want to merge them.');
    });

    it('should handle branch not fully merged errors', () => {
      const error = new Error('branch \'feature-xyz\' is not fully merged');
      const result = translateGitError(error);
      expect(result).to.equal('The branch \'feature-xyz\' has changes that haven\'t been merged yet. Use \'wt merge feature-xyz\' first, or use -D to force delete.');
    });

    it('should handle cannot delete current branch errors', () => {
      const error = new Error('Cannot delete the branch \'main\' which you are currently on');
      const result = translateGitError(error);
      expect(result).to.equal('You can\'t delete the branch you\'re currently on. Switch to a different branch first.');
    });

    it('should handle non-fast-forward push errors', () => {
      const error = new Error('failed to push some refs\nnon-fast-forward');
      const result = translateGitError(error);
      expect(result).to.equal('Your branch is behind the remote. Pull the latest changes first with \'git pull\', then try pushing again.');
    });

    it('should handle generic push failures', () => {
      const error = new Error('failed to push some refs to origin');
      const result = translateGitError(error);
      expect(result).to.equal('Failed to push your changes. Make sure you have permission and the remote repository exists.');
    });

    it('should handle SSH authentication errors', () => {
      const error = new Error('Permission denied (publickey)');
      const result = translateGitError(error);
      expect(result).to.equal('Git couldn\'t authenticate with the remote server. Check that your SSH key is set up correctly, or use HTTPS instead.');
    });

    it('should handle unable to access errors', () => {
      const error = new Error('unable to access https://github.com/user/repo.git');
      const result = translateGitError(error);
      expect(result).to.equal('Can\'t connect to the remote repository. Check your internet connection and that the repository URL is correct.');
    });

    it('should handle not a git repository errors', () => {
      const error = new Error('not a git repository (or any of the parent directories)');
      const result = translateGitError(error);
      expect(result).to.equal('This isn\'t a git repository. Navigate to your project folder or run \'git init\' to create one.');
    });

    it('should handle generic permission denied errors', () => {
      const error = new Error('Permission denied');
      const result = translateGitError(error);
      expect(result).to.equal('You don\'t have permission to do that. Check file permissions or try running with sudo.');
    });

    it('should handle fatal errors', () => {
      const error = new Error('fatal: something went wrong');
      const result = translateGitError(error);
      expect(result).to.equal('Git error: something went wrong');
    });

    it('should add context when provided', () => {
      const error = new Error('some error');
      const result = translateGitError(error, 'create worktree');
      expect(result).to.equal('Failed to create worktree: some error');
    });

    it('should clean up error prefixes', () => {
      const error = new Error('error: this is an error');
      const result = translateGitError(error);
      expect(result).to.equal('this is an error');
    });

    it('should handle errors with toString() method', () => {
      const error = { toString: () => 'custom error string' };
      const result = translateGitError(error);
      expect(result).to.equal('custom error string');
    });
  });

  describe('translateFSError', () => {
    it('should handle EACCES errors', () => {
      const error = { code: 'EACCES' };
      const result = translateFSError(error, 'write file');
      expect(result).to.equal('You don\'t have permission to write file. Check that you own the files or try running with administrator privileges.');
    });

    it('should handle ENOSPC errors', () => {
      const error = { code: 'ENOSPC' };
      const result = translateFSError(error);
      expect(result).to.equal('Your disk is full. Free up some space and try again.');
    });

    it('should handle ENOENT errors', () => {
      const error = { code: 'ENOENT' };
      const result = translateFSError(error, 'read config');
      expect(result).to.equal('The file or folder needed to read config doesn\'t exist.');
    });

    it('should handle EEXIST errors', () => {
      const error = { code: 'EEXIST' };
      const result = translateFSError(error, 'create directory');
      expect(result).to.equal('Can\'t create directory because a file or folder already exists at that location.');
    });

    it('should handle EISDIR errors', () => {
      const error = { code: 'EISDIR' };
      const result = translateFSError(error, 'read file');
      expect(result).to.equal('Can\'t read file because it\'s a directory, not a file.');
    });

    it('should handle ENOTDIR errors', () => {
      const error = { code: 'ENOTDIR' };
      const result = translateFSError(error, 'list directory');
      expect(result).to.equal('Can\'t list directory because it\'s a file, not a directory.');
    });

    it('should handle EMFILE errors', () => {
      const error = { code: 'EMFILE' };
      const result = translateFSError(error);
      expect(result).to.equal('Too many files are open. Close some programs and try again.');
    });

    it('should handle EROFS errors', () => {
      const error = { code: 'EROFS' };
      const result = translateFSError(error, 'save changes');
      expect(result).to.equal('Can\'t save changes because the file system is read-only.');
    });

    it('should handle EBUSY errors', () => {
      const error = { code: 'EBUSY' };
      const result = translateFSError(error, 'delete file');
      expect(result).to.equal('Can\'t delete file because the file or folder is being used by another program.');
    });

    it('should handle EINVAL errors', () => {
      const error = { code: 'EINVAL' };
      const result = translateFSError(error, 'process data');
      expect(result).to.equal('Can\'t process data because of invalid input or corrupted data.');
    });

    it('should handle unknown errors with message', () => {
      const error = { code: 'UNKNOWN', message: 'Something went wrong' };
      const result = translateFSError(error, 'do something');
      expect(result).to.equal('Failed to do something: Something went wrong');
    });

    it('should handle unknown errors without message', () => {
      const error = { code: 'UNKNOWN' };
      const result = translateFSError(error, 'do something');
      expect(result).to.equal('An unexpected error occurred while trying to do something.');
    });

    it('should use default operation when not provided', () => {
      const error = { code: 'UNKNOWN' };
      const result = translateFSError(error);
      expect(result).to.equal('An unexpected error occurred while trying to perform operation.');
    });
  });

  describe('translateJSONError', () => {
    it('should handle unexpected token errors', () => {
      const error = new Error('Unexpected token } in JSON at position 42');
      const result = translateJSONError(error, 'config.json');
      expect(result).to.equal('The configuration file \'config.json\' is corrupted or has invalid formatting. Try deleting it and running \'wt init\' again.');
    });

    it('should handle generic JSON errors', () => {
      const error = new Error('JSON.parse failed');
      const result = translateJSONError(error, 'settings.json');
      expect(result).to.equal('Can\'t read the configuration file \'settings.json\'. It may be corrupted. Try deleting it and running \'wt init\' again.');
    });

    it('should return original message for non-JSON errors', () => {
      const error = new Error('Some other error');
      const result = translateJSONError(error, 'file.json');
      expect(result).to.equal('Some other error');
    });
  });

  describe('addCommandContext', () => {
    it('should add tips for create command with branch errors', () => {
      const result = addCommandContext('branch not found', 'create');
      expect(result.message).to.equal('branch not found');
      expect(result.tips).to.include('Use "git branch" to see available branches');
      expect(result.tips).to.include('Use "--from <branch>" to create a new branch');
    });

    it('should add tips for create command with reference errors', () => {
      const result = addCommandContext('invalid reference', 'create');
      expect(result.tips).to.include('Use "git branch" to see available branches');
      expect(result.tips).to.include('Use "--from <branch>" to create a new branch');
    });

    it('should add tips for remove command with changes', () => {
      const result = addCommandContext('uncommitted changes', 'remove');
      expect(result.tips).to.include('Use "git status" to see what changes you have');
      expect(result.tips).to.include('Use "--force" to delete anyway (changes will be lost!)');
    });

    it('should add tips for merge command with conflicts', () => {
      const result = addCommandContext('merge conflict detected', 'merge');
      expect(result.tips).to.include('Fix conflicts manually in your text editor');
      expect(result.tips).to.include('Look for <<<<<<< and >>>>>>> markers in files');
      expect(result.tips).to.include('After fixing, use "git add" and "git commit"');
    });

    it('should add tips for list command with configuration errors', () => {
      const result = addCommandContext('configuration not found', 'list');
      expect(result.tips).to.include('Run "wt init" to set up the worktree tool');
    });

    it('should add tips for any command mentioning worktree', () => {
      const result = addCommandContext('worktree error', 'somecommand');
      expect(result.tips).to.include('Use "wt list" to see all worktrees');
    });

    it('should return empty tips for unmatched cases', () => {
      const result = addCommandContext('some error', 'unknowncommand');
      expect(result.message).to.equal('some error');
      expect(result.tips).to.be.empty;
    });

    it('should handle multiple tip conditions', () => {
      const result = addCommandContext('worktree configuration error', 'list');
      expect(result.tips).to.include('Run "wt init" to set up the worktree tool');
      expect(result.tips).to.include('Use "wt list" to see all worktrees');
    });
  });
});