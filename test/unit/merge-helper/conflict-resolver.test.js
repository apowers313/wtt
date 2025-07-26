const fs = require('fs').promises;
const chalk = require('chalk');
const inquirer = require('inquirer');
const { spawn } = require('child_process');
const ConflictResolver = require('../../../lib/merge-helper/conflict-resolver');
const ConflictUI = require('../../../lib/ui/conflict-ui');
const ProgressTracker = require('../../../lib/merge-helper/progress-tracker');
const ConflictDetector = require('../../../lib/merge-helper/conflict-detector');
const simpleGit = require('simple-git');

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    rename: jest.fn()
  }
}));
jest.mock('inquirer');
jest.mock('child_process');
jest.mock('../../../lib/ui/conflict-ui');
jest.mock('../../../lib/merge-helper/progress-tracker');
jest.mock('../../../lib/merge-helper/conflict-detector');
jest.mock('simple-git');
jest.mock('../../../lib/gitOps');

describe('ConflictResolver', () => {
  let resolver;
  let mockUI;
  let mockProgressTracker;
  let mockDetector;
  let mockGit;
  let mockConsoleLog;
  let mockConsoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    
    mockUI = {
      displayConflict: jest.fn(),
      displayResolutionSuccess: jest.fn()
    };
    ConflictUI.mockImplementation(() => mockUI);
    
    mockProgressTracker = {
      start: jest.fn(),
      update: jest.fn(),
      complete: jest.fn()
    };
    ProgressTracker.mockImplementation(() => mockProgressTracker);
    
    mockDetector = {
      findConflicts: jest.fn(),
      analyzeFileConflicts: jest.fn()
    };
    ConflictDetector.mockImplementation(() => mockDetector);
    
    mockGit = {
      add: jest.fn(),
      checkout: jest.fn()
    };
    simpleGit.mockReturnValue(mockGit);
    
    resolver = new ConflictResolver();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('resolveAll', () => {
    it('should display no conflicts message when none found', async () => {
      mockDetector.findConflicts.mockResolvedValue([]);
      
      await resolver.resolveAll();
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.green('✅ No conflicts to resolve!')
      );
      expect(mockProgressTracker.start).not.toHaveBeenCalled();
    });

    it('should resolve all conflicts using interactive mode', async () => {
      const mockConflicts = [
        { file: 'file1.js', count: 2 },
        { file: 'file2.js', count: 1 }
      ];
      mockDetector.findConflicts.mockResolvedValue(mockConflicts);
      
      // Mock resolveFile to simulate successful resolution
      resolver.resolveFile = jest.fn().mockResolvedValue();
      
      await resolver.resolveAll();
      
      expect(mockProgressTracker.start).toHaveBeenCalledWith('Resolving conflicts');
      expect(resolver.resolveFile).toHaveBeenCalledTimes(2);
      expect(resolver.resolveFile).toHaveBeenCalledWith('file1.js', {});
      expect(resolver.resolveFile).toHaveBeenCalledWith('file2.js', {});
      expect(mockProgressTracker.complete).toHaveBeenCalled();
    });

    it('should resolve conflicts with external tool when specified', async () => {
      const mockConflicts = [{ file: 'file1.js', count: 1 }];
      mockDetector.findConflicts.mockResolvedValue(mockConflicts);
      
      resolver.resolveWithTool = jest.fn().mockResolvedValue();
      
      await resolver.resolveAll({ tool: 'vscode' });
      
      expect(resolver.resolveWithTool).toHaveBeenCalledWith('file1.js', 'vscode');
      expect(mockProgressTracker.update).toHaveBeenCalledWith('file1.js', 'completed');
    });

    it('should handle errors and ask to continue', async () => {
      const mockConflicts = [
        { file: 'file1.js', count: 1 },
        { file: 'file2.js', count: 1 }
      ];
      mockDetector.findConflicts.mockResolvedValue(mockConflicts);
      
      resolver.resolveFile = jest.fn()
        .mockRejectedValueOnce(new Error('Resolution failed'))
        .mockResolvedValueOnce();
      
      inquirer.prompt.mockResolvedValue({ continueResolving: true });
      
      await resolver.resolveAll();
      
      expect(mockProgressTracker.update).toHaveBeenCalledWith('file1.js', 'error');
      expect(mockConsoleError).toHaveBeenCalledWith(
        chalk.red('\nError resolving file1.js: Resolution failed')
      );
      expect(resolver.resolveFile).toHaveBeenCalledTimes(2);
    });

    it('should stop resolving when user chooses not to continue', async () => {
      const mockConflicts = [
        { file: 'file1.js', count: 1 },
        { file: 'file2.js', count: 1 }
      ];
      mockDetector.findConflicts.mockResolvedValue(mockConflicts);
      
      resolver.resolveFile = jest.fn()
        .mockRejectedValueOnce(new Error('Resolution failed'));
      
      inquirer.prompt.mockResolvedValue({ continueResolving: false });
      
      await resolver.resolveAll();
      
      expect(resolver.resolveFile).toHaveBeenCalledTimes(1);
      expect(mockProgressTracker.complete).toHaveBeenCalled();
    });
  });

  describe('resolveFile', () => {
    it('should display no conflicts message when file has no conflicts', async () => {
      // Mock readFile to return text content (not binary)
      fs.readFile.mockResolvedValue(Buffer.from('console.log("hello");'));
      mockDetector.analyzeFileConflicts.mockResolvedValue({ count: 0, conflicts: [] });
      
      await resolver.resolveFile('file.js');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.yellow('No conflicts found in file.js')
      );
    });

    it('should resolve conflicts in a file', async () => {
      const mockConflictInfo = {
        count: 1,
        conflicts: [{
          startLine: 10,
          endLine: 20,
          ours: ['our code'],
          theirs: ['their code']
        }]
      };
      mockDetector.analyzeFileConflicts.mockResolvedValue(mockConflictInfo);
      
      const fileContent = 'file content with conflict markers';
      fs.readFile.mockResolvedValue(fileContent);
      
      resolver.presentConflictOptions = jest.fn().mockResolvedValue({
        action: 'accept_ours',
        content: 'our code'
      });
      resolver.applyResolution = jest.fn().mockResolvedValue('resolved content');
      
      inquirer.prompt.mockResolvedValue({ stageFile: true });
      mockGit.add.mockResolvedValue();
      
      await resolver.resolveFile('file.js');
      
      expect(fs.readFile).toHaveBeenCalledWith('file.js', 'utf8');
      expect(resolver.presentConflictOptions).toHaveBeenCalled();
      expect(resolver.applyResolution).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith('file.js', 'resolved content');
      expect(mockGit.add).toHaveBeenCalledWith('file.js');
    });

    it('should not stage file when user declines', async () => {
      const mockConflictInfo = {
        count: 1,
        conflicts: [{
          startLine: 10,
          endLine: 20,
          ours: ['our code'],
          theirs: ['their code']
        }]
      };
      mockDetector.analyzeFileConflicts.mockResolvedValue(mockConflictInfo);
      
      fs.readFile.mockResolvedValue('file content');
      resolver.presentConflictOptions = jest.fn().mockResolvedValue({
        action: 'accept_ours',
        content: 'our code'
      });
      resolver.applyResolution = jest.fn().mockResolvedValue('resolved content');
      
      inquirer.prompt.mockResolvedValue({ stageFile: false });
      
      await resolver.resolveFile('file.js');
      
      expect(mockGit.add).not.toHaveBeenCalled();
    });
  });

  describe('acceptAll', () => {
    it('should accept all conflicts from ours side', async () => {
      const mockConflicts = [
        { file: 'file1.js', count: 2 },
        { file: 'file2.js', count: 1 }
      ];
      mockDetector.findConflicts.mockResolvedValue(mockConflicts);
      
      inquirer.prompt.mockResolvedValue({ confirmAcceptAll: true });
      mockGit.checkout.mockResolvedValue();
      mockGit.add.mockResolvedValue();
      
      await resolver.acceptAll('ours');
      
      expect(mockGit.checkout).toHaveBeenCalledWith(['--ours', 'file1.js']);
      expect(mockGit.checkout).toHaveBeenCalledWith(['--ours', 'file2.js']);
      expect(mockGit.add).toHaveBeenCalledWith('file1.js');
      expect(mockGit.add).toHaveBeenCalledWith('file2.js');
    });

    it('should accept all conflicts from theirs side', async () => {
      const mockConflicts = [
        { file: 'file1.js', count: 1 }
      ];
      mockDetector.findConflicts.mockResolvedValue(mockConflicts);
      
      inquirer.prompt.mockResolvedValue({ confirmAcceptAll: true });
      mockGit.checkout.mockResolvedValue();
      mockGit.add.mockResolvedValue();
      
      await resolver.acceptAll('theirs');
      
      expect(mockGit.checkout).toHaveBeenCalledWith(['--theirs', 'file1.js']);
      expect(mockGit.add).toHaveBeenCalledWith('file1.js');
    });

    it('should cancel when user declines confirmation', async () => {
      const mockConflicts = [
        { file: 'file1.js', count: 1 }
      ];
      mockDetector.findConflicts.mockResolvedValue(mockConflicts);
      
      inquirer.prompt.mockResolvedValue({ confirmAcceptAll: false });
      
      await resolver.acceptAll('ours');
      
      expect(mockGit.checkout).not.toHaveBeenCalled();
      expect(mockGit.add).not.toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.yellow('Cancelled'));
    });
  });

  describe('generateSmartOptions', () => {
    it('should generate average option for numeric conflicts', () => {
      const conflict = {
        ours: ['const timeout = 5000'],
        theirs: ['const timeout = 3000']
      };
      
      const options = resolver.generateSmartOptions(conflict);
      
      expect(options).toContainEqual(
        expect.objectContaining({
          label: 'Use average value (4000)',
          action: 'smart_average'
        })
      );
    });

    it('should generate import combination option', () => {
      const conflict = {
        ours: ['import { foo } from \'module\''],
        theirs: ['import { bar } from \'module\'']
      };
      
      resolver.isImportConflict = jest.fn().mockReturnValue(true);
      resolver.combineImports = jest.fn().mockReturnValue('import { bar, foo } from \'module\'');
      
      const options = resolver.generateSmartOptions(conflict);
      
      expect(options).toContainEqual(
        expect.objectContaining({
          label: 'Combine both imports',
          action: 'combine_imports'
        })
      );
    });
  });

  describe('isImportConflict', () => {
    it('should detect import conflicts', () => {
      const conflict = {
        ours: ['import { Component } from \'react\''],
        theirs: ['import React from \'react\'']
      };
      
      const result = resolver.isImportConflict(conflict);
      
      expect(result).toBe(true);
    });

    it('should detect require conflicts', () => {
      const conflict = {
        ours: ['const fs = require(\'fs\')'],
        theirs: ['const { readFile } = require(\'fs\')']
      };
      
      const result = resolver.isImportConflict(conflict);
      
      expect(result).toBe(true);
    });

    it('should return false for non-import conflicts', () => {
      const conflict = {
        ours: ['const timeout = 5000'],
        theirs: ['const timeout = 3000']
      };
      
      const result = resolver.isImportConflict(conflict);
      
      expect(result).toBe(false);
    });
  });

  describe('combineImports', () => {
    it('should combine and sort imports', () => {
      const ours = ['import { A } from \'module\'', 'import { B } from \'module\''];
      const theirs = ['import { C } from \'module\'', 'import { B } from \'module\''];
      
      const result = resolver.combineImports(ours, theirs);
      
      expect(result).toBe('import { A } from \'module\'\nimport { B } from \'module\'\nimport { C } from \'module\'');
    });

    it('should remove duplicates', () => {
      const ours = ['import React from \'react\''];
      const theirs = ['import React from \'react\''];
      
      const result = resolver.combineImports(ours, theirs);
      
      expect(result).toBe('import React from \'react\'');
    });

    it('should filter empty lines', () => {
      const ours = ['import React from \'react\'', '', '  '];
      const theirs = ['', 'import Component from \'component\''];
      
      const result = resolver.combineImports(ours, theirs);
      
      expect(result).toBe('import Component from \'component\'\nimport React from \'react\'');
    });
  });

  describe('resolveWithTool', () => {
    it('should resolve conflicts using external tool', async () => {
      const mockChild = {
        on: jest.fn((event, callback) => {
          if (event === 'exit') {
            // Simulate async behavior
            setTimeout(() => callback(0), 0);
          }
        })
      };
      spawn.mockReturnValue(mockChild);
      
      // Mock the conflict check after tool use
      mockDetector.analyzeFileConflicts.mockResolvedValue({ count: 0, conflicts: [] });
      
      const promise = resolver.resolveWithTool('file.js', 'vscode');
      
      // Wait for the promise to resolve
      await promise;
      
      expect(spawn).toHaveBeenCalledWith('code --wait --merge', ['file.js'], { 
        shell: true,
        stdio: 'inherit' 
      });
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.blue('Opening file.js in vscode...')
      );
    });

    it('should handle tool execution errors', async () => {
      const mockChild = {
        on: jest.fn((event, callback) => {
          if (event === 'exit') callback(1);
        })
      };
      spawn.mockReturnValue(mockChild);
      
      await expect(resolver.resolveWithTool('file.js', 'vscode'))
        .rejects.toThrow('Tool exited with code 1');
    });

    it('should warn if conflicts remain after tool use', async () => {
      const mockChild = {
        on: jest.fn((event, callback) => {
          if (event === 'exit') callback(0);
        })
      };
      spawn.mockReturnValue(mockChild);
      
      // Mock conflicts still exist
      mockDetector.analyzeFileConflicts.mockResolvedValue({ 
        count: 2, 
        conflicts: [
          { startLine: 10, endLine: 20 },
          { startLine: 30, endLine: 40 }
        ] 
      });
      
      inquirer.prompt.mockResolvedValue({ continueWithFile: true });
      
      await resolver.resolveWithTool('file.js', 'vscode');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.yellow('\n⚠️  2 conflict(s) still remain in file.js')
      );
    });

    it('should use custom tool command when provided', async () => {
      const mockChild = {
        on: jest.fn((event, callback) => {
          if (event === 'exit') callback(0);
        })
      };
      spawn.mockReturnValue(mockChild);
      mockDetector.analyzeFileConflicts.mockResolvedValue({ count: 0, conflicts: [] });
      
      await resolver.resolveWithTool('file.js', 'customtool --flags');
      
      expect(spawn).toHaveBeenCalledWith('customtool --flags', ['file.js'], { 
        shell: true,
        stdio: 'inherit' 
      });
    });

    it('should handle spawn error', async () => {
      const mockChild = {
        on: jest.fn((event, callback) => {
          if (event === 'error') callback(new Error('Spawn failed'));
        })
      };
      spawn.mockReturnValue(mockChild);
      
      await expect(resolver.resolveWithTool('file.js', 'vscode'))
        .rejects.toThrow('Spawn failed');
    });

    it('should reject when user declines to continue with unresolved conflicts', async () => {
      const mockChild = {
        on: jest.fn((event, callback) => {
          if (event === 'exit') callback(0);
        })
      };
      spawn.mockReturnValue(mockChild);
      
      mockDetector.analyzeFileConflicts.mockResolvedValue({ 
        count: 1, 
        conflicts: [{ startLine: 10, endLine: 20 }] 
      });
      
      inquirer.prompt.mockResolvedValue({ continueWithFile: false });
      
      await expect(resolver.resolveWithTool('file.js', 'vscode'))
        .rejects.toThrow('Conflicts not fully resolved');
    });
  });

  describe('isBinaryFile', () => {
    it('should detect binary files by null bytes', async () => {
      const binaryBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00, 0x0A]); // PNG-like with null byte
      fs.readFile.mockResolvedValue(binaryBuffer);
      
      const result = await resolver.isBinaryFile('image.png');
      
      expect(result).toBe(true);
    });

    it('should detect binary files by extension', async () => {
      const textBuffer = Buffer.from('console.log("hello");');
      fs.readFile.mockResolvedValue(textBuffer);
      
      const result = await resolver.isBinaryFile('image.jpg');
      
      expect(result).toBe(true);
    });

    it('should detect text files correctly', async () => {
      const textBuffer = Buffer.from('console.log("hello world");');
      fs.readFile.mockResolvedValue(textBuffer);
      
      const result = await resolver.isBinaryFile('script.js');
      
      expect(result).toBe(false);
    });

    it('should return true when file cannot be read', async () => {
      fs.readFile.mockRejectedValue(new Error('File not found'));
      
      const result = await resolver.isBinaryFile('missing.txt');
      
      expect(result).toBe(true);
    });

    it('should handle various binary extensions', async () => {
      const textBuffer = Buffer.from('text content');
      fs.readFile.mockResolvedValue(textBuffer);
      
      const binaryExtensions = ['.pdf', '.exe', '.zip', '.mp3', '.ttf'];
      
      for (const ext of binaryExtensions) {
        const result = await resolver.isBinaryFile(`file${ext}`);
        expect(result).toBe(true);
      }
    });
  });

  describe('resolveBinaryConflict', () => {
    beforeEach(() => {
      const mockGitOps = require('../../../lib/gitOps');
      mockGitOps.ensureGit = jest.fn().mockResolvedValue(mockGit);
    });

    it('should resolve binary conflict by keeping ours', async () => {
      mockGit.show = jest.fn()
        .mockResolvedValueOnce('our content')
        .mockResolvedValueOnce('their content');
      
      inquirer.prompt.mockResolvedValue({ resolution: 'ours' });
      
      await resolver.resolveBinaryConflict('binary.png');
      
      expect(mockGit.checkout).toHaveBeenCalledWith(['--ours', 'binary.png']);
      expect(mockGit.add).toHaveBeenCalledWith('binary.png');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.green('✅ Kept your version of binary.png')
      );
    });

    it('should resolve binary conflict by keeping theirs', async () => {
      mockGit.show = jest.fn()
        .mockResolvedValueOnce('our content')
        .mockResolvedValueOnce('their content');
      
      inquirer.prompt.mockResolvedValue({ resolution: 'theirs' });
      
      await resolver.resolveBinaryConflict('binary.png');
      
      expect(mockGit.checkout).toHaveBeenCalledWith(['--theirs', 'binary.png']);
      expect(mockGit.add).toHaveBeenCalledWith('binary.png');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.green('✅ Kept their version of binary.png')
      );
    });

    it('should resolve binary conflict by keeping both versions', async () => {
      mockGit.show = jest.fn()
        .mockResolvedValueOnce('our content')
        .mockResolvedValueOnce('their content');
      
      inquirer.prompt.mockResolvedValue({ resolution: 'both' });
      mockGit.rm = jest.fn();
      fs.rename = jest.fn();
      
      await resolver.resolveBinaryConflict('path/to/file.png');
      
      expect(mockGit.checkout).toHaveBeenCalledWith(['--ours', 'path/to/file.png']);
      expect(fs.rename).toHaveBeenCalledWith('path/to/file.png', 'path/to/file.ours.png');
      expect(mockGit.checkout).toHaveBeenCalledWith(['--theirs', 'path/to/file.png']);
      expect(fs.rename).toHaveBeenCalledWith('path/to/file.png', 'path/to/file.theirs.png');
      expect(mockGit.rm).toHaveBeenCalledWith('path/to/file.png');
      expect(mockGit.add).toHaveBeenCalledWith(['path/to/file.ours.png', 'path/to/file.theirs.png']);
    });

    it('should resolve binary conflict by deleting file', async () => {
      mockGit.show = jest.fn()
        .mockResolvedValueOnce('our content')
        .mockResolvedValueOnce('their content');
      
      inquirer.prompt.mockResolvedValue({ resolution: 'delete' });
      mockGit.rm = jest.fn();
      
      await resolver.resolveBinaryConflict('binary.png');
      
      expect(mockGit.rm).toHaveBeenCalledWith('binary.png');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.green('✅ Deleted binary.png')
      );
    });

    it('should handle skip resolution', async () => {
      mockGit.show = jest.fn()
        .mockResolvedValueOnce('our content')
        .mockResolvedValueOnce('their content');
      
      inquirer.prompt.mockResolvedValue({ resolution: 'skip' });
      
      await resolver.resolveBinaryConflict('binary.png');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.yellow('⏭️  Skipped binary.png')
      );
      expect(mockGit.checkout).not.toHaveBeenCalled();
    });

    it('should handle git show errors gracefully', async () => {
      mockGit.show = jest.fn().mockRejectedValue(new Error('Git show failed'));
      inquirer.prompt.mockResolvedValue({ resolution: 'ours' });
      
      await resolver.resolveBinaryConflict('binary.png');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.gray('  Your version (ours): size unknown')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.gray('  Their version (theirs): size unknown')
      );
    });
  });

  describe('applyResolution', () => {
    it('should apply resolution to file content correctly', async () => {
      const content = 'line1\nline2\nconflict area\nline4\nline5';
      const conflict = { startLine: 3, endLine: 3 };
      const resolution = { content: 'resolved line' };
      
      const result = await resolver.applyResolution(content, conflict, resolution);
      
      expect(result).toBe('line1\nline2\nresolved line\nline4\nline5');
    });

    it('should handle multi-line resolutions', async () => {
      const content = 'line1\nconflict\nline3';
      const conflict = { startLine: 2, endLine: 2 };
      const resolution = { content: 'resolved line 1\nresolved line 2' };
      
      const result = await resolver.applyResolution(content, conflict, resolution);
      
      expect(result).toBe('line1\nresolved line 1\nresolved line 2\nline3');
    });
  });

  describe('generateResolutionOptions', () => {
    it('should generate basic resolution options', () => {
      const conflict = {
        ours: ['our code'],
        theirs: ['their code']
      };
      
      const options = resolver.generateResolutionOptions(conflict);
      
      expect(options).toHaveLength(6);
      expect(options[0]).toMatchObject({
        label: 'Keep your version',
        action: 'keep_ours',
        content: 'our code'
      });
      expect(options[1]).toMatchObject({
        label: 'Keep team\'s version',
        action: 'keep_theirs',
        content: 'their code'
      });
    });

    it('should include smart options from generateSmartOptions', () => {
      const conflict = {
        ours: ['const timeout = 5000'],
        theirs: ['const timeout = 3000']
      };
      
      resolver.generateSmartOptions = jest.fn().mockReturnValue([
        { label: 'Smart option', action: 'smart' }
      ]);
      
      const options = resolver.generateResolutionOptions(conflict);
      
      expect(resolver.generateSmartOptions).toHaveBeenCalledWith(conflict);
      expect(options.find(opt => opt.action === 'smart')).toBeTruthy();
    });
  });

  describe('presentConflictOptions', () => {
    it('should handle custom resolution action', async () => {
      const conflict = {
        file: 'test.js',
        startLine: 10,
        ours: ['our code'],
        theirs: ['their code']
      };
      
      resolver.ui.showConflict = jest.fn();
      resolver.generateResolutionOptions = jest.fn().mockReturnValue([]);
      resolver.ui.promptForChoice = jest.fn().mockResolvedValue({ action: 'custom' });
      resolver.getCustomResolution = jest.fn().mockResolvedValue('custom content');
      
      const result = await resolver.presentConflictOptions(conflict);
      
      expect(resolver.getCustomResolution).toHaveBeenCalledWith(conflict);
      expect(result.content).toBe('custom content');
    });

    it('should handle view_context action', async () => {
      const conflict = { 
        file: 'test.js', 
        startLine: 10,
        ours: ['our code'],
        theirs: ['their code']
      };
      
      resolver.ui.showConflict = jest.fn();
      resolver.generateResolutionOptions = jest.fn().mockReturnValue([]);
      resolver.ui.promptForChoice = jest.fn()
        .mockResolvedValueOnce({ action: 'view_context' })
        .mockResolvedValueOnce({ action: 'keep_ours', content: 'final choice' });
      resolver.showExtendedContext = jest.fn();
      
      const result = await resolver.presentConflictOptions(conflict);
      
      expect(resolver.showExtendedContext).toHaveBeenCalledWith(conflict);
      expect(result.content).toBe('final choice');
    });

    it('should handle help action', async () => {
      const conflict = { 
        file: 'test.js', 
        startLine: 10,
        ours: ['our code'],
        theirs: ['their code']
      };
      
      resolver.ui.showConflict = jest.fn();
      resolver.generateResolutionOptions = jest.fn().mockReturnValue([]);
      resolver.ui.promptForChoice = jest.fn()
        .mockResolvedValueOnce({ action: 'help' })
        .mockResolvedValueOnce({ action: 'keep_ours', content: 'final choice' });
      resolver.showConflictHelp = jest.fn();
      
      const result = await resolver.presentConflictOptions(conflict);
      
      expect(resolver.showConflictHelp).toHaveBeenCalledWith(conflict);
      expect(result.content).toBe('final choice');
    });
  });
});