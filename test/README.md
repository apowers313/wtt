# Git Worktree Tool Test Suite

This directory contains the test suite for the Git Worktree Tool (wtt) using Jest.

## Test Structure

```
test/
├── unit/                    # Unit tests for individual modules
├── integration/             # Integration tests for commands
├── e2e/                     # End-to-end workflow tests
└── helpers/                 # Test utilities and helpers
    ├── TestRepository.js    # Helper for creating test git repos
    ├── utils.js            # Utility functions
    └── mocks.js            # Mock implementations
```

## Running Tests

```bash
# Install dependencies first
npm install

# Run all tests
npm test

# Run specific test categories
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e          # E2E tests only

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Working Tests

The `test/integration/working-tests.test.js` file contains a set of verified working tests that demonstrate the core functionality:

- `init` - Initialize worktree configuration
- `create` - Create new worktrees with port assignment
- `list` - List all worktrees
- `ports` - Show port assignments
- `switch` - Get path to switch to a worktree
- `remove` - Remove worktrees

## Test Helpers

### TestRepository

Creates isolated git repositories for testing:

```javascript
const repo = new TestRepository();
await repo.init();  // Creates temp repo with initial commit
await repo.run('init');  // Run wt commands
await repo.cleanup();  // Clean up after test
```

### Important Notes

- Tests use real git operations in temporary directories
- GPG signing is disabled for test commits only
- The test helper automatically renames 'master' to 'main' for consistency
- Each test runs in its own isolated repository

## Known Issues

Some of the original test files may have failing tests due to:
- Expected output not matching actual command output
- Commands expecting different parameter formats
- Branch naming differences (master vs main)

Use `working-tests.test.js` as a reference for writing new tests.