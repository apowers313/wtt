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
    unlink: jest.fn()
  }
}));
jest.mock('inquirer');
jest.mock('child_process');
jest.mock('../../../lib/ui/conflict-ui');
jest.mock('../../../lib/merge-helper/progress-tracker');
jest.mock('../../../lib/merge-helper/conflict-detector');
jest.mock('simple-git');

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
      mockDetector.analyzeFileConflicts.mockResolvedValue({ count: 0, conflicts: [] });
      
      await resolver.resolveFile('file.js');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        chalk.yellow('No conflicts found in file.js')
      );
      expect(fs.readFile).not.toHaveBeenCalled();
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
  });
});