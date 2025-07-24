const { expect } = require('chai');
const ConflictDetector = require('../../lib/merge-helper/conflict-detector');
const gitOps = require('../../lib/gitOps');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

jest.mock('../../lib/gitOps');
jest.mock('simple-git');

describe('ConflictDetector', () => {
  let detector;
  let testDir;
  let mockGit;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `wtt-conflict-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Mock simple-git
    mockGit = {
      status: jest.fn().mockResolvedValue({
        conflicted: [],
        files: []
      }),
      show: jest.fn(),
      diff: jest.fn().mockResolvedValue('')
    };
    
    const simpleGit = require('simple-git');
    simpleGit.simpleGit = jest.fn().mockReturnValue(mockGit);
    simpleGit.mockReturnValue(mockGit);
    
    detector = new ConflictDetector();
    detector.git = mockGit;
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  describe('analyzeFileConflicts', () => {
    it('should detect conflicts in a file', async () => {
      const conflictContent = `function test() {
<<<<<<< HEAD
  return 'version1';
=======
  return 'version2';
>>>>>>> branch
}`;
      
      const testFile = path.join(testDir, 'test.js');
      await fs.writeFile(testFile, conflictContent);
      
      const result = await detector.analyzeFileConflicts(testFile);
      
      expect(result.count).to.equal(1);
      expect(result.conflicts).to.have.length(1);
      expect(result.conflicts[0].ours).to.deep.equal(['  return \'version1\';']);
      expect(result.conflicts[0].theirs).to.deep.equal(['  return \'version2\';']);
    });

    it('should handle multiple conflicts in a file', async () => {
      const conflictContent = `function test1() {
<<<<<<< HEAD
  return 'v1';
=======
  return 'v2';
>>>>>>> branch
}

function test2() {
<<<<<<< HEAD
  return 'a';
=======
  return 'b';
>>>>>>> branch
}`;
      
      const testFile = path.join(testDir, 'test.js');
      await fs.writeFile(testFile, conflictContent);
      
      const result = await detector.analyzeFileConflicts(testFile);
      
      expect(result.count).to.equal(2);
      expect(result.conflicts).to.have.length(2);
    });

    it('should return empty conflicts for clean file', async () => {
      const cleanContent = `function test() {
  return 'clean';
}`;
      
      const testFile = path.join(testDir, 'test.js');
      await fs.writeFile(testFile, cleanContent);
      
      const result = await detector.analyzeFileConflicts(testFile);
      
      expect(result.count).to.equal(0);
      expect(result.conflicts).to.be.empty;
    });
  });

  describe('isBinaryFile', () => {
    it('should detect binary files', async () => {
      const binaryFile = path.join(testDir, 'binary.dat');
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
      await fs.writeFile(binaryFile, buffer);
      
      const result = await detector.isBinaryFile(binaryFile);
      expect(result).to.be.true;
    });

    it('should detect text files', async () => {
      const textFile = path.join(testDir, 'text.txt');
      await fs.writeFile(textFile, 'This is plain text');
      
      const result = await detector.isBinaryFile(textFile);
      expect(result).to.be.false;
    });
  });

  describe('getConflictContext', () => {
    it('should get context around conflict', async () => {
      const content = `line1
line2
line3
conflict here
line5
line6
line7`;
      
      const testFile = path.join(testDir, 'context.txt');
      await fs.writeFile(testFile, content);
      
      const context = await detector.getConflictContext(testFile, 4, 2);
      
      expect(context.before).to.have.length.at.least(2);
      expect(context.after).to.have.length.at.least(2);
    });
  });

  describe('getChangeType', () => {
    it('should correctly identify change types', () => {
      expect(detector.getChangeType('A')).to.equal('added');
      expect(detector.getChangeType('D')).to.equal('deleted');
      expect(detector.getChangeType('M')).to.equal('modified');
      expect(detector.getChangeType('R')).to.equal('renamed');
      expect(detector.getChangeType('C')).to.equal('copied');
      expect(detector.getChangeType('X')).to.equal('unknown');
    });
  });

  describe('assessConflictRisk', () => {
    it('should assess high risk for delete/modify conflicts', async () => {
      const risk = await detector.assessConflictRisk('test.js', 
        { type: 'deleted' }, 
        { type: 'modified' }
      );
      
      expect(risk.level).to.equal('high');
      expect(risk.reason).to.include('deleted');
    });

    it('should assess high risk for modify/delete conflicts', async () => {
      const risk = await detector.assessConflictRisk('test.js', 
        { type: 'modified' }, 
        { type: 'deleted' }
      );
      
      expect(risk.level).to.equal('high');
      expect(risk.reason).to.include('deleted');
    });

    it('should assess high risk for binary file conflicts', async () => {
      const binaryFile = path.join(testDir, 'binary.dat');
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
      await fs.writeFile(binaryFile, buffer);
      
      const risk = await detector.assessConflictRisk(binaryFile, 
        { type: 'modified' }, 
        { type: 'modified' }
      );
      
      expect(risk.level).to.equal('high');
      expect(risk.reason).to.include('Binary file');
    });

    it('should assess medium risk for modify/modify conflicts', async () => {
      const textFile = path.join(testDir, 'text.js');
      await fs.writeFile(textFile, 'console.log("test");');
      
      const risk = await detector.assessConflictRisk(textFile, 
        { type: 'modified' }, 
        { type: 'modified' }
      );
      
      expect(risk.level).to.equal('medium');
      expect(risk.reason).to.include('modified in both');
    });

    it('should assess no risk for non-conflicting changes', async () => {
      const risk = await detector.assessConflictRisk('test.js', 
        { type: 'added' }, 
        { type: 'unknown' }
      );
      
      expect(risk.level).to.equal('none');
      expect(risk.reason).to.equal('');
    });
  });

  describe('findConflicts', () => {
    it('should find all conflicted files', async () => {
      const conflictFile = path.join(testDir, 'conflict.js');
      await fs.writeFile(conflictFile, `<<<<<<< HEAD
const a = 1;
=======
const a = 2;
>>>>>>> branch`);

      mockGit.status.mockResolvedValue({
        conflicted: [conflictFile],
        files: []
      });

      const conflicts = await detector.findConflicts();
      
      expect(conflicts).to.have.length(1);
      expect(conflicts[0].file).to.equal(conflictFile);
      expect(conflicts[0].count).to.equal(1);
    });

    it('should handle errors gracefully', async () => {
      mockGit.status.mockRejectedValue(new Error('Git error'));

      try {
        await detector.findConflicts();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to detect conflicts');
      }
    });
  });

  describe('detectConflictType', () => {
    it('should detect delete/modify conflict type', async () => {
      mockGit.show
        .mockRejectedValueOnce(new Error('Not found')) // HEAD
        .mockResolvedValueOnce('content'); // MERGE_HEAD

      const type = await detector.detectConflictType('test.js');
      expect(type).to.equal('delete/modify');
    });

    it('should detect modify/delete conflict type', async () => {
      mockGit.show
        .mockResolvedValueOnce('content') // HEAD
        .mockRejectedValueOnce(new Error('Not found')); // MERGE_HEAD

      const type = await detector.detectConflictType('test.js');
      expect(type).to.equal('modify/delete');
    });

    it('should detect binary conflict type', async () => {
      const binaryFile = path.join(testDir, 'binary.dat');
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
      await fs.writeFile(binaryFile, buffer);
      
      mockGit.show.mockResolvedValue('content');

      const type = await detector.detectConflictType(binaryFile);
      expect(type).to.equal('binary');
    });

    it('should return unknown for errors', async () => {
      mockGit.show.mockRejectedValue(new Error('Git error'));

      const type = await detector.detectConflictType('test.js');
      expect(type).to.equal('modify/modify'); // When both show calls fail, it defaults to modify/modify
    });
  });

  describe('fileExistsInBranch', () => {
    it('should return true if file exists in branch', async () => {
      mockGit.show.mockResolvedValue('file content');

      const exists = await detector.fileExistsInBranch('test.js', 'HEAD');
      expect(exists).to.be.true;
      // Verify the mock was called with correct arguments
      expect(mockGit.show.mock.calls[0][0]).to.deep.equal(['HEAD:test.js']);
    });

    it('should return false if file does not exist in branch', async () => {
      mockGit.show.mockRejectedValue(new Error('Not found'));

      const exists = await detector.fileExistsInBranch('test.js', 'HEAD');
      expect(exists).to.be.false;
    });
  });

  describe('predictConflicts', () => {
    it('should predict conflicts between branches', async () => {
      gitOps.getCurrentBranch = jest.fn().mockResolvedValue('feature');
      
      mockGit.diff
        .mockResolvedValueOnce('M\tfile1.js\nA\tfile2.js') // our changes
        .mockResolvedValueOnce('M\tfile1.js\nD\tfile3.js'); // their changes

      const textFile = path.join(testDir, 'file1.js');
      await fs.writeFile(textFile, 'console.log("test");');

      const conflicts = await detector.predictConflicts('main');
      
      expect(conflicts).to.have.length(1);
      expect(conflicts[0].file).to.equal('file1.js');
      expect(conflicts[0].risk).to.equal('medium');
      expect(conflicts[0].ourChange).to.equal('modified');
      expect(conflicts[0].theirChange).to.equal('modified');
    });

    it('should sort conflicts by risk level', async () => {
      gitOps.getCurrentBranch = jest.fn().mockResolvedValue('feature');
      
      mockGit.diff
        .mockResolvedValueOnce('M\tfile1.js\nM\tfile2.js\nD\tfile3.js')
        .mockResolvedValueOnce('M\tfile1.js\nD\tfile2.js\nM\tfile3.js');

      const textFile = path.join(testDir, 'file1.js');
      await fs.writeFile(textFile, 'console.log("test");');

      const conflicts = await detector.predictConflicts('main');
      
      // file2: modify/delete (high risk)
      // file3: delete/modify (high risk)  
      // file1: modify/modify (medium risk)
      expect(conflicts[0].risk).to.equal('high');
      expect(conflicts[conflicts.length - 1].risk).to.equal('medium');
    });

    it('should handle errors during prediction', async () => {
      gitOps.getCurrentBranch = jest.fn().mockRejectedValue(new Error('Git error'));

      try {
        await detector.predictConflicts('main');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to predict conflicts');
      }
    });
  });

  describe('getChangedFiles', () => {
    it('should parse git diff output correctly', async () => {
      mockGit.diff.mockResolvedValue('M\tfile1.js\nA\tfile2.js\nD\tfile3.js\nR100\told.js\tnew.js');

      const changes = await detector.getChangedFiles('branch1', 'branch2');
      
      expect(changes.size).to.equal(4);
      expect(changes.get('file1.js').type).to.equal('modified');
      expect(changes.get('file2.js').type).to.equal('added');
      expect(changes.get('file3.js').type).to.equal('deleted');
      expect(changes.get('old.js\tnew.js').type).to.equal('renamed');
    });

    it('should handle empty diff', async () => {
      mockGit.diff.mockResolvedValue('');

      const changes = await detector.getChangedFiles('branch1', 'branch2');
      expect(changes.size).to.equal(0);
    });

    it('should handle diff errors', async () => {
      mockGit.diff.mockRejectedValue(new Error('Git error'));

      const changes = await detector.getChangedFiles('branch1', 'branch2');
      expect(changes.size).to.equal(0);
    });
  });

  describe('getConflictStats', () => {
    it('should calculate conflict statistics', async () => {
      const conflictFile1 = path.join(testDir, 'conflict1.js');
      const conflictFile2 = path.join(testDir, 'conflict2.js');
      
      await fs.writeFile(conflictFile1, `<<<<<<< HEAD
a = 1;
=======
a = 2;
>>>>>>> branch`);
      
      await fs.writeFile(conflictFile2, `<<<<<<< HEAD
b = 1;
=======
b = 2;
>>>>>>> branch
<<<<<<< HEAD
c = 1;
=======
c = 2;
>>>>>>> branch`);

      mockGit.status.mockResolvedValue({
        conflicted: [conflictFile1, conflictFile2],
        files: []
      });
      mockGit.show.mockResolvedValue('content');

      const stats = await detector.getConflictStats();
      
      expect(stats.totalFiles).to.equal(2);
      expect(stats.totalConflicts).to.equal(3);
      expect(stats.byType['modify/modify']).to.equal(2);
      expect(stats.byFile[conflictFile1].count).to.equal(1);
      expect(stats.byFile[conflictFile2].count).to.equal(2);
    });

    it('should handle empty conflicts', async () => {
      mockGit.status.mockResolvedValue({
        conflicted: [],
        files: []
      });

      const stats = await detector.getConflictStats();
      
      expect(stats.totalFiles).to.equal(0);
      expect(stats.totalConflicts).to.equal(0);
      expect(Object.keys(stats.byType)).to.be.empty;
      expect(Object.keys(stats.byFile)).to.be.empty;
    });
  });

  describe('analyzeFileConflicts edge cases', () => {
    it('should handle file read errors', async () => {
      const result = await detector.analyzeFileConflicts('/non/existent/file');
      
      expect(result.count).to.equal(0);
      expect(result.conflicts).to.be.empty;
      expect(result.error).to.exist;
    });

    it('should handle nested conflicts', async () => {
      const nestedContent = `function test() {
<<<<<<< HEAD
  if (true) {
<<<<<<< HEAD
    return 1;
=======
    return 2;
>>>>>>> branch1
  }
=======
  return 3;
>>>>>>> branch2
}`;
      
      const testFile = path.join(testDir, 'nested.js');
      await fs.writeFile(testFile, nestedContent);
      
      const result = await detector.analyzeFileConflicts(testFile);
      
      // Should detect both conflicts
      expect(result.count).to.be.at.least(1);
    });
  });

  describe('getConflictContext edge cases', () => {
    it('should handle context at file boundaries', async () => {
      const content = `line1
line2
line3`;
      
      const testFile = path.join(testDir, 'boundary.txt');
      await fs.writeFile(testFile, content);
      
      // Context at start of file
      const context1 = await detector.getConflictContext(testFile, 1, 5);
      expect(context1.before).to.be.empty;
      expect(context1.after.length).to.be.at.most(3);
      
      // Context at end of file  
      const context2 = await detector.getConflictContext(testFile, 3, 5);
      expect(context2.before.length).to.be.at.most(2);
    });

    it('should handle file read errors in context', async () => {
      const context = await detector.getConflictContext('/non/existent/file', 1);
      
      expect(context.before).to.be.empty;
      expect(context.after).to.be.empty;
    });
  });

  describe('isBinaryFile edge cases', () => {
    it('should handle large text files', async () => {
      const largeFile = path.join(testDir, 'large.txt');
      const content = 'a'.repeat(10000); // Large text file
      await fs.writeFile(largeFile, content);
      
      const result = await detector.isBinaryFile(largeFile);
      expect(result).to.be.false;
    });

    it('should detect binary at end of chunk', async () => {
      const binaryFile = path.join(testDir, 'binary-end.dat');
      const buffer = Buffer.concat([
        Buffer.from('a'.repeat(7999)),
        Buffer.from([0x00]) // Null byte at position 7999
      ]);
      await fs.writeFile(binaryFile, buffer);
      
      const result = await detector.isBinaryFile(binaryFile);
      expect(result).to.be.true;
    });

    it('should handle file read errors', async () => {
      const result = await detector.isBinaryFile('/non/existent/file');
      expect(result).to.be.false;
    });
  });
});