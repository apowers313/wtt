# Git Worktree Tool Testing Strategy

## Overview

This document outlines a comprehensive testing strategy for the Git Worktree Tool (wtt) that prioritizes realistic testing while maintaining practical test execution times. The approach minimizes mocking in favor of actual git operations in temporary repositories.

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Categories](#test-categories)
3. [Test Infrastructure](#test-infrastructure)
4. [Implementation Guidelines](#implementation-guidelines)
5. [Best Practices for CLI Testing](#best-practices-for-cli-testing)
6. [Test Structure](#test-structure)
7. [Continuous Integration](#continuous-integration)
8. [Performance Considerations](#performance-considerations)

## Testing Philosophy

### Core Principles

1. **Real Operations Over Mocks**: Use actual git repositories and file system operations
2. **Isolated Test Environments**: Each test suite runs in its own temporary directory
3. **Fast Feedback**: Tests should complete quickly despite using real operations
4. **Deterministic Results**: Tests should be reproducible and not depend on external state
5. **Clear Failure Messages**: When tests fail, the reason should be immediately obvious

### What We Test

- **Integration Tests** (Primary Focus): Test complete command flows with real git operations
- **Unit Tests** (Secondary): Test isolated functions for complex logic (port assignment, config parsing)
- **E2E Tests** (Selective): Test critical user journeys end-to-end

### What We Don't Mock

- Git operations (use real git commands)
- File system operations
- Port availability checks
- Command execution

### What We Do Mock (Sparingly)

- External network calls (if any)
- System time (for consistent timestamps)
- User input prompts (use programmatic responses)

## Test Categories

### 1. Integration Tests (70% of tests)

These test complete command flows in real git repositories.

```javascript
// Example: Testing 'wt create' command
describe('wt create command', () => {
  let testRepo;
  
  beforeEach(async () => {
    testRepo = await createTestRepository();
    await testRepo.init();
    await testRepo.createBranch('develop');
  });
  
  afterEach(async () => {
    await testRepo.cleanup();
  });
  
  test('creates worktree with correct structure', async () => {
    const result = await testRepo.run('wt create feature-test');
    
    expect(result.exitCode).toBe(0);
    expect(await testRepo.exists('.worktrees/wt-feature-test')).toBe(true);
    expect(await testRepo.readFile('.worktrees/wt-feature-test/.env.worktree'))
      .toContain('VITE_PORT=3010');
  });
});
```

### 2. Unit Tests (20% of tests)

Test individual modules in isolation.

```javascript
// Example: Testing port assignment logic
describe('PortManager', () => {
  test('assigns next available port', () => {
    const usedPorts = [3000, 3010, 3020];
    const range = { start: 3000, increment: 10 };
    
    const port = portManager.findAvailablePort(range, usedPorts);
    
    expect(port).toBe(3030);
  });
});
```

### 3. E2E Tests (10% of tests)

Test complete workflows from initialization to cleanup.

```javascript
// Example: Complete feature development workflow
test('complete feature workflow', async () => {
  const repo = await createTestRepository();
  
  // Initialize
  await repo.run('wt init');
  
  // Create feature
  await repo.run('wt create feature-auth');
  
  // Make changes
  await repo.inWorktree('wt-feature-auth', async () => {
    await repo.writeFile('auth.js', 'export const auth = () => {}');
    await repo.git('add .');
    await repo.git('commit -m "Add auth"');
  });
  
  // Merge back
  await repo.run('wt merge wt-feature-auth --delete');
  
  // Verify
  expect(await repo.currentBranch()).toBe('main');
  expect(await repo.exists('.worktrees/wt-feature-auth')).toBe(false);
});
```

## Test Infrastructure

### 1. Test Repository Factory

Create a reusable test repository factory:

```javascript
// test/helpers/TestRepository.js
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class TestRepository {
  constructor() {
    this.dir = null;
    this.name = `test-repo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  async init() {
    // Create temp directory
    this.dir = path.join(os.tmpdir(), 'wtt-tests', this.name);
    await fs.ensureDir(this.dir);
    
    // Initialize git repo
    await this.git('init');
    await this.git('config user.email "test@example.com"');
    await this.git('config user.name "Test User"');
    
    // Create initial commit
    await this.writeFile('README.md', '# Test Repository');
    await this.git('add .');
    await this.git('commit -m "Initial commit"');
    
    // Copy wt tool
    await this.installTool();
    
    return this;
  }
  
  async installTool() {
    // Copy the wt tool to the test repository
    const toolPath = path.resolve(__dirname, '../../wt.js');
    const libPath = path.resolve(__dirname, '../../lib');
    const commandsPath = path.resolve(__dirname, '../../commands');
    
    await fs.copy(toolPath, path.join(this.dir, 'wt.js'));
    await fs.copy(libPath, path.join(this.dir, 'lib'));
    await fs.copy(commandsPath, path.join(this.dir, 'commands'));
    await fs.copy(
      path.resolve(__dirname, '../../package.json'),
      path.join(this.dir, 'package.json')
    );
    
    // Install dependencies
    await this.exec('npm install --production');
  }
  
  async run(command) {
    // Run wt command in test repository
    const fullCommand = `node wt.js ${command.replace('wt ', '')}`;
    return await this.exec(fullCommand);
  }
  
  async git(command) {
    return await this.exec(`git ${command}`);
  }
  
  async exec(command) {
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: this.dir });
      return { 
        exitCode: 0, 
        stdout: stdout.trim(), 
        stderr: stderr.trim() 
      };
    } catch (error) {
      return { 
        exitCode: error.code || 1, 
        stdout: error.stdout?.trim() || '', 
        stderr: error.stderr?.trim() || error.message 
      };
    }
  }
  
  async writeFile(filePath, content) {
    const fullPath = path.join(this.dir, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content);
  }
  
  async readFile(filePath) {
    return await fs.readFile(path.join(this.dir, filePath), 'utf8');
  }
  
  async exists(filePath) {
    try {
      await fs.access(path.join(this.dir, filePath));
      return true;
    } catch {
      return false;
    }
  }
  
  async inWorktree(worktreeName, callback) {
    const originalDir = this.dir;
    this.dir = path.join(this.dir, '.worktrees', worktreeName);
    try {
      await callback();
    } finally {
      this.dir = originalDir;
    }
  }
  
  async currentBranch() {
    const result = await this.git('branch --show-current');
    return result.stdout;
  }
  
  async createBranch(branchName) {
    await this.git(`checkout -b ${branchName}`);
    await this.git('checkout main');
  }
  
  async cleanup() {
    if (this.dir) {
      await fs.remove(this.dir);
    }
  }
}

module.exports = { TestRepository };
```

### 2. Test Utilities

Common utilities for testing:

```javascript
// test/helpers/utils.js

// Wait for port to be available
async function waitForPort(port, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isPortFree(port)) {
      return true;
    }
    await sleep(100);
  }
  return false;
}

// Check if port is free
async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = require('net').createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Capture console output
function captureOutput(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const output = { stdout: [], stderr: [] };
  
  console.log = (...args) => output.stdout.push(args.join(' '));
  console.error = (...args) => output.stderr.push(args.join(' '));
  
  try {
    fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  
  return output;
}

module.exports = {
  waitForPort,
  isPortFree,
  sleep,
  captureOutput
};
```

### 3. Mock Implementations

For the few things we do mock:

```javascript
// test/helpers/mocks.js

// Mock inquirer for non-interactive testing
function mockInquirer(answers) {
  return {
    prompt: jest.fn().mockImplementation((questions) => {
      const result = {};
      questions.forEach(q => {
        result[q.name] = answers[q.name] ?? q.default;
      });
      return Promise.resolve(result);
    })
  };
}

// Mock current time for deterministic tests
function mockTime(timestamp) {
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor() {
      super();
      return new RealDate(timestamp);
    }
    static now() {
      return new RealDate(timestamp).getTime();
    }
  };
  
  return () => {
    global.Date = RealDate;
  };
}

module.exports = {
  mockInquirer,
  mockTime
};
```

## Implementation Guidelines

### 1. Test File Structure

```
test/
├── unit/
│   ├── config.test.js
│   ├── portManager.test.js
│   └── gitOps.test.js
├── integration/
│   ├── commands/
│   │   ├── create.test.js
│   │   ├── list.test.js
│   │   ├── merge.test.js
│   │   ├── remove.test.js
│   │   ├── switch.test.js
│   │   └── ports.test.js
│   └── workflows/
│       ├── parallel-development.test.js
│       └── merge-conflicts.test.js
├── e2e/
│   ├── complete-workflow.test.js
│   └── error-recovery.test.js
├── helpers/
│   ├── TestRepository.js
│   ├── utils.js
│   └── mocks.js
└── jest.config.js
```

### 2. Jest Configuration

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.js'
  ],
  collectCoverageFrom: [
    'lib/**/*.js',
    'commands/**/*.js',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testTimeout: 30000, // 30 seconds for integration tests
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  globalSetup: '<rootDir>/test/globalSetup.js',
  globalTeardown: '<rootDir>/test/globalTeardown.js'
};
```

### 3. Test Setup

```javascript
// test/setup.js
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Ensure test directory exists
beforeAll(async () => {
  const testDir = path.join(os.tmpdir(), 'wtt-tests');
  await fs.ensureDir(testDir);
});

// Clean up any hanging test repos after all tests
afterAll(async () => {
  const testDir = path.join(os.tmpdir(), 'wtt-tests');
  const repos = await fs.readdir(testDir);
  
  // Clean up old test repos (older than 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const repo of repos) {
    const repoPath = path.join(testDir, repo);
    const stats = await fs.stat(repoPath);
    if (stats.mtimeMs < oneHourAgo) {
      await fs.remove(repoPath);
    }
  }
});
```

## Best Practices for CLI Testing

### 1. Command Testing Pattern

```javascript
describe('Command: wt create', () => {
  let repo;
  
  beforeEach(async () => {
    repo = new TestRepository();
    await repo.init();
    await repo.run('wt init');
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });
  
  describe('Success cases', () => {
    test('creates worktree for new branch', async () => {
      const result = await repo.run('wt create feature-test --from main');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Worktree created');
      expect(result.stdout).toContain('vite: 3010');
    });
  });
  
  describe('Error cases', () => {
    test('fails when branch already exists', async () => {
      await repo.git('checkout -b feature-exists');
      await repo.git('checkout main');
      
      const result = await repo.run('wt create feature-exists --from main');
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('already exists');
    });
  });
  
  describe('Edge cases', () => {
    test('handles branch names with special characters', async () => {
      const result = await repo.run('wt create feature/auth-system');
      
      expect(result.exitCode).toBe(0);
      expect(await repo.exists('.worktrees/wt-feature-auth-system')).toBe(true);
    });
  });
});
```

### 2. Port Management Testing

```javascript
describe('Port management', () => {
  test('assigns unique ports to multiple worktrees', async () => {
    const repo = new TestRepository();
    await repo.init();
    await repo.run('wt init');
    
    // Create multiple worktrees
    await repo.run('wt create feature-1');
    await repo.run('wt create feature-2');
    await repo.run('wt create feature-3');
    
    // Read port assignments
    const portMap = JSON.parse(
      await repo.readFile('.worktrees/.port-map.json')
    );
    
    // Extract all assigned ports
    const allPorts = [];
    Object.values(portMap).forEach(worktree => {
      Object.entries(worktree).forEach(([key, value]) => {
        if (key !== 'created' && typeof value === 'number') {
          allPorts.push(value);
        }
      });
    });
    
    // Verify uniqueness
    const uniquePorts = new Set(allPorts);
    expect(uniquePorts.size).toBe(allPorts.length);
    
    await repo.cleanup();
  });
});
```

### 3. Interactive Command Testing

```javascript
describe('Interactive commands', () => {
  test('wt remove with confirmation', async () => {
    const repo = new TestRepository();
    await repo.init();
    await repo.run('wt init');
    await repo.run('wt create feature-test');
    
    // Mock inquirer to auto-confirm
    jest.doMock('inquirer', () => ({
      prompt: jest.fn().mockResolvedValue({ confirmFinal: true })
    }));
    
    const result = await repo.run('wt remove wt-feature-test');
    
    expect(result.exitCode).toBe(0);
    expect(await repo.exists('.worktrees/wt-feature-test')).toBe(false);
    
    jest.unmock('inquirer');
    await repo.cleanup();
  });
});
```

### 4. Error Recovery Testing

```javascript
describe('Error recovery', () => {
  test('recovers from interrupted worktree creation', async () => {
    const repo = new TestRepository();
    await repo.init();
    await repo.run('wt init');
    
    // Simulate partial worktree creation
    await repo.git('worktree add .worktrees/wt-broken broken-branch');
    // Don't create .env.worktree or update port map
    
    // Try to create same worktree again
    const result = await repo.run('wt create broken-branch');
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('already exists');
    
    // Clean up broken worktree
    const removeResult = await repo.run('wt remove wt-broken --force');
    expect(removeResult.exitCode).toBe(0);
    
    await repo.cleanup();
  });
});
```

## Test Structure

### 1. Unit Test Example

```javascript
// test/unit/portManager.test.js
const PortManager = require('../../lib/portManager');

describe('PortManager', () => {
  let portManager;
  
  beforeEach(() => {
    // Create new instance for each test
    portManager = Object.create(PortManager);
    portManager.portMap = {};
  });
  
  describe('findAvailablePort', () => {
    test('returns first port when none are used', () => {
      const range = { start: 3000, increment: 10 };
      const usedPorts = [];
      
      const port = portManager.findAvailablePort(range, usedPorts);
      
      expect(port).toBe(3000);
    });
    
    test('skips used ports', () => {
      const range = { start: 3000, increment: 10 };
      const usedPorts = [3000, 3010];
      
      const port = portManager.findAvailablePort(range, usedPorts);
      
      expect(port).toBe(3020);
    });
    
    test('throws when no ports available in reasonable range', () => {
      const range = { start: 65530, increment: 10 };
      const usedPorts = [65530];
      
      expect(() => {
        portManager.findAvailablePort(range, usedPorts);
      }).toThrow('No available ports in range');
    });
  });
});
```

### 2. Integration Test Example

```javascript
// test/integration/commands/create.test.js
const { TestRepository } = require('../../helpers/TestRepository');

describe('wt create command', () => {
  let repo;
  
  beforeEach(async () => {
    repo = new TestRepository();
    await repo.init();
    await repo.run('wt init');
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });
  
  test('creates worktree with all required files', async () => {
    const result = await repo.run('wt create feature-test');
    
    expect(result.exitCode).toBe(0);
    
    // Check worktree exists
    expect(await repo.exists('.worktrees/wt-feature-test')).toBe(true);
    
    // Check .env.worktree
    const envContent = await repo.readFile('.worktrees/wt-feature-test/.env.worktree');
    expect(envContent).toContain('VITE_PORT=3010');
    expect(envContent).toContain('STORYBOOK_PORT=6016');
    expect(envContent).toContain('WORKTREE_NAME=wt-feature-test');
    
    // Check port map
    const portMap = JSON.parse(await repo.readFile('.worktrees/.port-map.json'));
    expect(portMap['wt-feature-test']).toEqual({
      vite: 3010,
      storybook: 6016,
      custom: 8010,
      created: expect.any(String)
    });
    
    // Check git worktree
    const worktrees = await repo.git('worktree list');
    expect(worktrees.stdout).toContain('wt-feature-test');
  });
});
```

### 3. E2E Test Example

```javascript
// test/e2e/complete-workflow.test.js
const { TestRepository } = require('../helpers/TestRepository');

describe('Complete feature development workflow', () => {
  let repo;
  
  beforeEach(async () => {
    repo = new TestRepository();
    await repo.init();
  });
  
  afterEach(async () => {
    await repo.cleanup();
  });
  
  test('develop and merge a feature', async () => {
    // Initialize wt
    await repo.run('wt init');
    
    // Create feature branch
    const createResult = await repo.run('wt create feature-awesome --from main');
    expect(createResult.exitCode).toBe(0);
    
    // Work in the worktree
    await repo.inWorktree('wt-feature-awesome', async () => {
      // Create feature files
      await repo.writeFile('src/awesome.js', 'export const awesome = () => "awesome";');
      await repo.git('add .');
      await repo.git('commit -m "Add awesome feature"');
    });
    
    // List worktrees
    const listResult = await repo.run('wt list');
    expect(listResult.stdout).toContain('wt-feature-awesome');
    
    // Check ports
    const portsResult = await repo.run('wt ports wt-feature-awesome');
    expect(portsResult.stdout).toContain('vite: 3010');
    
    // Mock inquirer for merge confirmation
    jest.doMock('inquirer', () => ({
      prompt: jest.fn()
        .mockResolvedValueOnce({ confirmDelete: true })
    }));
    
    // Merge back to main
    const mergeResult = await repo.run('wt merge wt-feature-awesome --delete');
    expect(mergeResult.exitCode).toBe(0);
    
    // Verify we're on main
    const branch = await repo.currentBranch();
    expect(branch).toBe('main');
    
    // Verify feature is merged
    expect(await repo.exists('src/awesome.js')).toBe(true);
    
    // Verify worktree is removed
    expect(await repo.exists('.worktrees/wt-feature-awesome')).toBe(false);
    
    // Verify ports are released
    const portMap = JSON.parse(await repo.readFile('.worktrees/.port-map.json'));
    expect(portMap['wt-feature-awesome']).toBeUndefined();
    
    jest.unmock('inquirer');
  });
});
```

## Continuous Integration

### GitHub Actions Configuration

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [14, 16, 18]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node }}
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run unit tests
      run: npm run test:unit
    
    - name: Run integration tests
      run: npm run test:integration
      
    - name: Run E2E tests
      run: npm run test:e2e
      if: matrix.os == 'ubuntu-latest' # Run E2E only on Linux for speed
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      if: matrix.os == 'ubuntu-latest' && matrix.node == '18'
```

### NPM Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest test/unit",
    "test:integration": "jest test/integration",
    "test:e2e": "jest test/e2e",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

## Performance Considerations

### 1. Parallel Test Execution

- Use Jest's default parallel execution for unit tests
- Run integration tests with `--maxWorkers=2` to avoid git conflicts
- E2E tests should run serially

### 2. Test Speed Optimization

```javascript
// Reuse test repositories when possible
class TestRepositoryPool {
  constructor(size = 3) {
    this.pool = [];
    this.size = size;
  }
  
  async acquire() {
    if (this.pool.length > 0) {
      const repo = this.pool.pop();
      await repo.reset();
      return repo;
    }
    
    const repo = new TestRepository();
    await repo.init();
    return repo;
  }
  
  async release(repo) {
    if (this.pool.length < this.size) {
      this.pool.push(repo);
    } else {
      await repo.cleanup();
    }
  }
}
```

### 3. Cleanup Strategy

- Clean up immediately after each test
- Use global teardown for hanging processes
- Set up CI to clean old test artifacts

### 4. Test Data Management

```javascript
// Use factories for consistent test data
const TestDataFactory = {
  createConfig(overrides = {}) {
    return {
      baseDir: '.worktrees',
      portRanges: {
        vite: { start: 3000, increment: 10 },
        storybook: { start: 6006, increment: 10 },
      },
      mainBranch: 'main',
      namePattern: 'wt-{branch}',
      ...overrides
    };
  },
  
  createPortMap(worktrees = {}) {
    const base = {
      'wt-existing': {
        vite: 3010,
        storybook: 6016,
        created: new Date().toISOString()
      }
    };
    return { ...base, ...worktrees };
  }
};
```

## Summary

This testing strategy provides:

1. **Realistic Testing**: Uses actual git operations and file systems
2. **Fast Feedback**: Optimized for quick test runs
3. **Comprehensive Coverage**: Unit, integration, and E2E tests
4. **CI/CD Ready**: Configured for automated testing
5. **Maintainable**: Clear patterns and reusable utilities

The approach ensures that tests catch real issues while remaining practical to run during development. By using temporary git repositories and actual command execution, we test the tool exactly as users will experience it.