# WTT Improvements Design Document
Date: 2025-07-25

## Executive Summary

The Git Worktree Tool (wtt) has grown too complex, resulting in verbose output, reliability issues, and poor user experience. This document outlines a comprehensive refactoring plan to address these issues while maintaining all core functionality.

## Current Problems

### 1. Excessive Output Verbosity

**Problem**: Simple commands produce 20+ lines of output with progress bars, animations, and redundant status messages.

**Example**:
```
⚡bar /tmp/foo/.worktrees/bar ▶ wt merge
Auto-detected current worktree: bar
Checking worktree 'bar'...
🔒 Creating safety backup...
  - Branch state saved
✅ Safety backup created
   Backup ID: merge-2025-07-25T15-18-35-429Z
   Recovery: wt restore --backup merge-2025-07-25T15-18-35-429Z
[... 15+ more lines of progress updates ...]
```

**Root Causes**:
- Progress UI uses terminal clearing and repositioning (`\x1B[2J\x1B[H`)
- Multi-step progress tracking for simple operations
- Overly detailed error messages with multiple sections
- Redundant status confirmations

### 2. Reliability Issues

**Problem**: Commands fail unpredictably based on working directory, git state, or environment.

**Root Causes**:
- Working directory switching without proper state management
- Path resolution uses multiple inconsistent strategies
- No validation of git repository state before operations
- Assumes branches exist and worktrees are valid
- Environment variable dependencies (`WTT_AUTO_CONFIRM`, `WTT_ERROR_LEVEL`)

**Specific Issues**:
- Detached HEAD states cause generic errors
- Commands fail when run from subdirectories
- Worktree detection is unreliable (requires retry logic in tests)
- No handling of corrupted worktrees or missing branches

### 3. Poor Help System

**Problem**: Help is not integrated with command structure and doesn't follow Unix conventions.

**Issues**:
- Hardcoded help topics don't match actual commands
- No `--help` flag integration with commander.js
- Separate help command instead of contextual help
- Static content that doesn't reflect command options

### 4. Test Brittleness

**Problem**: Tests frequently fail due to timing issues and environment dependencies.

**Root Causes**:
- Tests create real git repositories (slow and flaky)
- Retry logic indicates non-deterministic behavior
- Environment pollution between tests
- Cross-platform path handling issues

## Proposed Solutions

### 1. Concise Output System

**Design Principle**: Every command output should be 1-3 lines maximum unless verbose flag is used.

**Implementation**:

#### A. Create New Output Module (`lib/output.js`)

```javascript
class Output {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.quiet = options.quiet || false;
    this.prefix = 'wt';
  }

  // Primary output methods
  success(command, message) {
    if (!this.quiet) {
      console.log(`${this.prefix} ${command}: ${message}`);
    }
  }

  error(command, message, details = null) {
    console.error(`${this.prefix} ${command}: error: ${message}`);
    if (details && this.verbose) {
      console.error(`  ${details}`);
    }
  }

  info(command, message) {
    if (!this.quiet && this.verbose) {
      console.log(`${this.prefix} ${command}: ${message}`);
    }
  }

  // Status output for operations
  status(command, action, target) {
    if (!this.quiet) {
      console.log(`${this.prefix} ${command}: ${action} ${target}`);
    }
  }
}
```

#### B. Standard Output Patterns

**Success Cases**:
```bash
wt create: created worktree 'feature-auth' at .worktrees/feature-auth
wt merge: merged 'feature-auth' into master
wt remove: removed worktree 'feature-auth'
```

**Error Cases**:
```bash
wt merge: error: conflicts in 2 files (run 'git status' for details)
wt create: error: branch 'feature-auth' already exists
wt switch: error: uncommitted changes in current worktree
```

**With --verbose Flag**:
```bash
wt create: validating repository state
wt create: checking branch availability
wt create: creating worktree at /home/user/project/.worktrees/feature-auth
wt create: created worktree 'feature-auth' at .worktrees/feature-auth
```

#### C. Remove Progress Tracking

Replace all progress UI with simple status messages:
- Remove `lib/ui/progress-ui.js`
- Remove `lib/merge-helper/progress-tracker.js`
- Replace with single-line status updates using the Output module

### 2. Reliability Improvements

#### A. Path and Directory Management

**Create Central Path Manager (`lib/path-manager.js`)**:

```javascript
class PathManager {
  constructor(gitRoot) {
    this.gitRoot = gitRoot;
    this.worktreeBase = path.join(gitRoot, '.worktrees');
  }

  // Always return absolute paths
  getWorktreePath(name) {
    return path.join(this.worktreeBase, this.normalizeWorktreeName(name));
  }

  // Normalize worktree names consistently
  normalizeWorktreeName(name) {
    if (name.startsWith('wt-')) return name;
    return `wt-${name}`;
  }

  // Check if path is inside a worktree
  isInWorktree(currentPath) {
    const relative = path.relative(this.worktreeBase, currentPath);
    return !relative.startsWith('..');
  }

  // Get worktree name from any path inside it
  getWorktreeFromPath(currentPath) {
    if (!this.isInWorktree(currentPath)) return null;
    const relative = path.relative(this.worktreeBase, currentPath);
    return relative.split(path.sep)[0];
  }
}
```

#### B. Git Operations Without Directory Switching

**Use git -C flag for all operations**:

```javascript
class GitOperations {
  constructor(git, pathManager) {
    this.git = git;
    this.pathManager = pathManager;
  }

  async merge(worktreeName, targetBranch) {
    const worktreePath = this.pathManager.getWorktreePath(worktreeName);
    
    // Never change working directory
    await this.git.cwd(this.pathManager.gitRoot);
    
    // Execute in worktree using -C
    const result = await this.git.raw([
      '-C', worktreePath,
      'merge', targetBranch
    ]);
    
    return result;
  }
}
```

#### C. Pre-operation Validation

**Create Validation Module (`lib/validator.js`)**:

```javascript
class Validator {
  async validateWorktreeOperation(git, pathManager, worktreeName) {
    const errors = [];
    
    // Check if we're in a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      errors.push('not in a git repository');
    }
    
    // Check if worktree exists
    const worktreePath = pathManager.getWorktreePath(worktreeName);
    if (!await fs.pathExists(worktreePath)) {
      errors.push(`worktree '${worktreeName}' not found`);
    }
    
    // Check for uncommitted changes
    const status = await git.status();
    if (!status.isClean()) {
      errors.push('uncommitted changes in repository');
    }
    
    return errors;
  }
}
```

### 3. Unix-Style Help System

#### A. Integrate with Commander.js

**Update command definitions to include detailed help**:

```javascript
// In commands/merge.js
function addMergeCommand(program) {
  program
    .command('merge [branch]')
    .description('merge worktree branch into main branch')
    .option('-f, --force', 'force merge even with conflicts')
    .option('-n, --no-delete', 'keep worktree after merge')
    .option('--abort', 'abort current merge operation')
    .addHelpText('after', `
Examples:
  $ wt merge feature-auth    # merge feature-auth into main branch
  $ wt merge                 # merge current worktree
  $ wt merge --no-delete     # merge but keep worktree
  $ wt merge --abort         # abort in-progress merge

Exit codes:
  0  merge successful
  1  merge conflicts
  2  validation error
    `)
    .action(async (branch, options) => {
      // Implementation
    });
}
```

#### B. Hierarchical Help Structure

**Main help (wt --help)**:
```
Usage: wt [options] [command]

Git worktree management tool

Options:
  -V, --version     output version
  -v, --verbose     verbose output
  -q, --quiet       suppress output
  -h, --help        display help

Commands:
  init              initialize wtt in repository
  create <branch>   create new worktree
  list              list all worktrees
  switch <name>     switch to worktree directory
  merge [branch]    merge worktree into main branch
  remove <name>     remove worktree
  ports             manage port assignments

Run 'wt <command> --help' for command details
```

**Command help (wt merge --help)**:
```
Usage: wt merge [options] [branch]

merge worktree branch into main branch

Arguments:
  branch            worktree branch to merge (default: current)

Options:
  -f, --force       force merge even with conflicts
  -n, --no-delete   keep worktree after merge
  --abort           abort current merge operation
  -h, --help        display help for command

Examples:
  $ wt merge feature-auth    # merge feature-auth into main branch
  $ wt merge                 # merge current worktree
  $ wt merge --no-delete     # merge but keep worktree
  $ wt merge --abort         # abort in-progress merge

Exit codes:
  0  merge successful
  1  merge conflicts
  2  validation error
```

#### C. Help Topics Command

**Separate help topics for detailed guides**:

```javascript
// commands/help.js
function addHelpCommand(program) {
  program
    .command('help [topic]')
    .description('show help for specific topic')
    .action(async (topic) => {
      const topics = {
        'getting-started': 'Quick start guide for wtt',
        'merge-conflicts': 'Handling merge conflicts',
        'configuration': 'Configuration options',
        'troubleshooting': 'Common issues and solutions'
      };
      
      if (!topic) {
        console.log('Available topics:');
        Object.entries(topics).forEach(([name, desc]) => {
          console.log(`  ${name.padEnd(20)} ${desc}`);
        });
      } else {
        // Load and display topic content
      }
    });
}
```

### 4. Testing Improvements

#### A. Mock Git Operations

**Create Git Mock (`test/mocks/git-mock.js`)**:

```javascript
class GitMock {
  constructor() {
    this.state = {
      branches: ['master', 'develop'],
      currentBranch: 'master',
      worktrees: [],
      status: { isClean: true }
    };
  }

  async checkIsRepo() {
    return true;
  }

  async status() {
    return this.state.status;
  }

  async worktree(command, args) {
    if (command === 'list') {
      return this.state.worktrees;
    }
    if (command === 'add') {
      this.state.worktrees.push({
        path: args[0],
        branch: args[2]
      });
    }
  }

  // Add test helpers
  _setState(newState) {
    Object.assign(this.state, newState);
  }

  _reset() {
    this.state = { /* default state */ };
  }
}
```

#### B. Deterministic Test Structure

```javascript
// test/commands/merge.test.js
describe('merge command', () => {
  let gitMock, output, wt;
  
  beforeEach(() => {
    gitMock = new GitMock();
    output = new OutputMock();
    wt = createWttInstance({ git: gitMock, output });
  });

  afterEach(() => {
    gitMock._reset();
  });

  it('should merge worktree branch', async () => {
    // Setup deterministic state
    gitMock._setState({
      worktrees: [{ path: '.worktrees/wt-feature', branch: 'feature' }],
      currentBranch: 'feature'
    });

    // Execute command
    await wt.parse(['merge']);

    // Assert specific outputs
    expect(output.lines).toEqual([
      'wt merge: merging feature → master'
    ]);
  });
});
```

#### C. Remove Timing Dependencies

- No retry logic in tests
- No setTimeout or async delays
- Mock all file system operations
- Use deterministic test data

## Implementation Priority

1. **Phase 1: Output System** (Immediate UX improvement)
   - Implement Output module
   - Replace progress tracking in merge command
   - Update all commands to use new output format

2. **Phase 2: Reliability** (Core stability)
   - Implement PathManager
   - Add validation module
   - Fix git operations to avoid directory switching

3. **Phase 3: Help System** (Better documentation)
   - Integrate commander.js help
   - Add examples to all commands
   - Implement help topics

4. **Phase 4: Testing** (Long-term maintainability)
   - Create git and filesystem mocks
   - Refactor tests to use mocks
   - Remove all timing dependencies

## Success Metrics

1. **Output**: No command produces more than 3 lines unless --verbose
2. **Reliability**: All commands work from any directory in the repository
3. **Help**: Every command has --help with examples
4. **Testing**: Test suite runs in <5 seconds with 100% deterministic results

## Migration Strategy

1. Create new modules alongside existing code
2. Update commands one at a time
3. Keep backward compatibility during transition
4. Remove old modules after all commands migrated
5. Update tests after implementation is stable

## Code Examples for Implementation

### Example: Refactored Merge Command

```javascript
// commands/merge.js
const { Output } = require('../lib/output');
const { PathManager } = require('../lib/path-manager');
const { Validator } = require('../lib/validator');

async function executeMerge(branch, options, { git, config }) {
  const output = new Output(options);
  const pathManager = new PathManager(process.cwd());
  const validator = new Validator();
  
  try {
    // Determine branch to merge
    const targetBranch = branch || await getCurrentWorktreeBranch();
    
    // Validate operation
    const errors = await validator.validateWorktreeOperation(git, pathManager, targetBranch);
    if (errors.length > 0) {
      output.error('merge', errors[0]);
      process.exit(2);
    }
    
    // Perform merge
    output.status('merge', 'merging', `${targetBranch} → ${config.mainBranch}`);
    
    const result = await git.raw([
      '-C', pathManager.gitRoot,
      'merge', targetBranch
    ]);
    
    output.success('merge', `merged '${targetBranch}' into ${config.mainBranch}`);
    
  } catch (error) {
    if (error.message.includes('CONFLICT')) {
      const conflicts = await git.status();
      const fileCount = conflicts.conflicted.length;
      output.error('merge', `conflicts in ${fileCount} files (run 'git status' for details)`);
      process.exit(1);
    } else {
      output.error('merge', error.message);
      process.exit(2);
    }
  }
}
```

This design provides a clear path to simplify wtt while maintaining functionality and improving reliability.

## Test Refactoring Plan

### Current Test Problems

1. **Path Comparison Complexity**: 125-line `pathsEqual` function duplicated across tests
2. **Timing Dependencies**: Retry patterns throughout tests indicate race conditions
3. **Real Git Operations**: Tests create actual repositories (30+ second timeouts)
4. **Console Capture Duplication**: Manual console redirection in multiple tests
5. **Mock Setup Repetition**: Each test recreates similar configurations

### Test Helper Architecture

#### A. Test Factory Pattern

**Create `test/helpers/test-factory.js`**:

```javascript
class TestFactory {
  static async createScenario(type) {
    const scenarios = {
      'clean-repo': this.cleanRepo,
      'with-worktree': this.repoWithWorktree,
      'merge-conflict': this.repoWithConflict,
      'multiple-worktrees': this.repoWithMultipleWorktrees,
      'dirty-worktree': this.repoWithUncommittedChanges
    };
    
    if (!scenarios[type]) {
      throw new Error(`Unknown scenario: ${type}`);
    }
    
    return await scenarios[type]();
  }

  static async cleanRepo() {
    const repo = new MockRepository();
    await repo.init();
    return { repo, helpers: new TestHelpers(repo) };
  }

  static async repoWithWorktree(name = 'feature') {
    const { repo, helpers } = await this.cleanRepo();
    await repo.createBranch(name);
    await repo.createWorktree(name);
    return { repo, helpers, worktreeName: name };
  }

  static async repoWithConflict() {
    const { repo, helpers } = await this.cleanRepo();
    
    // Create conflicting branches
    await repo.createBranch('feature1');
    await repo.writeFile('test.txt', 'feature1 content');
    await repo.commit('Feature 1 change');
    
    await repo.checkout('main');
    await repo.createBranch('feature2');
    await repo.writeFile('test.txt', 'feature2 content');
    await repo.commit('Feature 2 change');
    
    return { repo, helpers };
  }
}
```

#### B. Common Assertions Module

**Create `test/helpers/assertions.js`**:

```javascript
class TestAssertions {
  // Worktree assertions
  static worktreeExists(repo, name, shouldExist = true) {
    const path = `.worktrees/wt-${name}`;
    const exists = repo.mockFS.exists(path);
    expect(exists).toBe(shouldExist);
  }

  static worktreeCount(repo, expectedCount) {
    const worktrees = repo.mockGit.state.worktrees;
    expect(worktrees.length).toBe(expectedCount);
  }

  // Output assertions
  static outputContains(result, text) {
    const output = result.stdout + result.stderr;
    expect(output).toContain(text);
  }

  static outputMatches(result, pattern) {
    const output = result.stdout + result.stderr;
    expect(output).toMatch(pattern);
  }

  static exitCode(result, expected) {
    expect(result.exitCode).toBe(expected);
  }

  // Port assertions
  static portsAssigned(portMap, worktreeName, services) {
    const ports = portMap[worktreeName];
    expect(ports).toBeDefined();
    services.forEach(service => {
      expect(ports[service]).toBeDefined();
      expect(ports[service]).toBeGreaterThan(0);
    });
  }

  // Git state assertions
  static currentBranch(repo, expectedBranch) {
    expect(repo.mockGit.state.currentBranch).toBe(expectedBranch);
  }

  static hasCommit(repo, message) {
    const commits = repo.mockGit.state.commits;
    const found = commits.some(c => c.message === message);
    expect(found).toBe(true);
  }
}
```

#### C. Console Capture Helper

**Create `test/helpers/console-capture.js`**:

```javascript
class ConsoleCapture {
  constructor() {
    this.stdout = [];
    this.stderr = [];
    this.originalLog = null;
    this.originalError = null;
  }

  start() {
    this.originalLog = console.log;
    this.originalError = console.error;
    
    console.log = (...args) => {
      this.stdout.push(args.join(' '));
    };
    
    console.error = (...args) => {
      this.stderr.push(args.join(' '));
    };
    
    return this;
  }

  stop() {
    console.log = this.originalLog;
    console.error = this.originalError;
    
    return {
      stdout: this.stdout.join('\n'),
      stderr: this.stderr.join('\n'),
      lines: [...this.stdout, ...this.stderr]
    };
  }

  getOutput() {
    return {
      stdout: this.stdout.join('\n'),
      stderr: this.stderr.join('\n')
    };
  }

  clear() {
    this.stdout = [];
    this.stderr = [];
  }
}
```

#### D. Path Utilities

**Create `test/helpers/path-utils.js`**:

```javascript
class TestPathUtils {
  static normalize(path) {
    // Simple normalization for tests
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  static areEqual(path1, path2) {
    return this.normalize(path1) === this.normalize(path2);
  }

  static join(...parts) {
    return this.normalize(parts.join('/'));
  }

  static relative(from, to) {
    // Simplified relative path for tests
    const fromParts = this.normalize(from).split('/');
    const toParts = this.normalize(to).split('/');
    
    // Find common prefix
    let common = 0;
    while (common < fromParts.length && 
           common < toParts.length && 
           fromParts[common] === toParts[common]) {
      common++;
    }
    
    // Build relative path
    const ups = fromParts.length - common;
    const result = [];
    for (let i = 0; i < ups; i++) result.push('..');
    result.push(...toParts.slice(common));
    
    return result.join('/');
  }
}
```

#### E. Mock Setup Helpers

**Create `test/helpers/mock-setup.js`**:

```javascript
class MockSetup {
  static gitOps(overrides = {}) {
    return {
      getCurrentBranch: jest.fn().mockResolvedValue('main'),
      getBranches: jest.fn().mockResolvedValue(['main', 'develop']),
      hasUncommittedChanges: jest.fn().mockResolvedValue(false),
      getWorktrees: jest.fn().mockResolvedValue([]),
      createWorktree: jest.fn().mockResolvedValue(true),
      removeWorktree: jest.fn().mockResolvedValue(true),
      ...overrides
    };
  }

  static portManager(ports = {}) {
    return {
      loadPortMap: jest.fn().mockResolvedValue({}),
      assignPorts: jest.fn().mockResolvedValue({
        vite: 3000,
        storybook: 6006,
        custom: 8080,
        ...ports
      }),
      releasePorts: jest.fn().mockResolvedValue(true),
      getAssignedPorts: jest.fn().mockResolvedValue(ports)
    };
  }

  static config(overrides = {}) {
    return {
      load: jest.fn().mockResolvedValue({
        worktreeDir: '.worktrees',
        mainBranch: 'main',
        ports: {
          vite: { start: 3000, end: 3099 },
          storybook: { start: 6006, end: 6106 }
        },
        ...overrides
      })
    };
  }
}
```

### Test Refactoring Examples

#### Before (Brittle Test):

```javascript
it('should create worktree with ports', async () => {
  const result = await repo.run('create test-feature');
  
  // Retry logic for timing issues
  await AsyncTestHelpers.retry(async () => {
    const exists = await repo.exists('.worktrees/wt-test-feature');
    expect(exists).toBe(true);
  });
  
  // Complex path checking
  const worktreePath = path.resolve(repo.dir, '.worktrees/wt-test-feature');
  expect(pathsEqual(result.worktreePath, worktreePath)).toBe(true);
  
  // Manual output checking
  expect(result.stdout).toContain('Created worktree');
});
```

#### After (Robust Test):

```javascript
it('should create worktree with ports', async () => {
  const { repo, helpers } = await TestFactory.createScenario('clean-repo');
  
  const result = await repo.run('create test-feature');
  
  TestAssertions.exitCode(result, 0);
  TestAssertions.worktreeExists(repo, 'test-feature');
  TestAssertions.portsAssigned(repo.portMap, 'test-feature', ['vite', 'storybook']);
  TestAssertions.outputContains(result, 'created worktree');
});
```

### Implementation Guidelines

1. **No Real Git Operations**: All tests use mocks
2. **No Timing Dependencies**: Remove all retry logic and timeouts
3. **Centralized Helpers**: Use factory and assertion helpers
4. **Fast Execution**: Target <5 seconds for entire test suite
5. **Deterministic Results**: Same input always produces same output

### Migration Path

1. Create helper modules in `test/helpers/`
2. Start with unit tests (already mostly mocked)
3. Refactor integration tests to use TestFactory
4. Replace console capture with ConsoleCapture helper
5. Remove old test utilities after migration

This test refactoring will dramatically improve test reliability and reduce execution time from 30+ seconds to under 5 seconds.