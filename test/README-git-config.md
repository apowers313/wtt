# Git Configuration for Tests

This document explains how wtt tests handle git configuration to ensure consistent behavior across different environments.

## Problem

Global git configurations can cause test failures:
- GPG signing (`commit.gpgsign = true`)
- Custom hooks
- Credential helpers
- Different default branch names
- Platform-specific settings (line endings, file modes)

## Solution

Tests use multiple layers of isolation:

### 1. Test-Specific Git Config (`test/fixtures/test-gitconfig`)

A minimal git configuration file that:
- Disables GPG signing
- Sets consistent user info
- Disables colors and pagers
- Configures predictable behavior

### 2. Environment Variable Isolation

Tests set environment variables to prevent git from reading external configs:
- `GIT_CONFIG_NOSYSTEM=1` - Ignores `/etc/gitconfig`
- `HOME=/test/dir` - Prevents reading `~/.gitconfig`
- `GPG_TTY=''` - Disables GPG operations

### 3. Local Repository Config

Each test repository explicitly sets:
```bash
git config --local commit.gpgsign false
git config --local user.name "Test User"
git config --local user.email "test@example.com"
```

## Troubleshooting

### Tests fail with "gpg failed to sign the data"

Your global git config has GPG signing enabled. The tests should handle this automatically, but if they don't:

1. Check test output for the warning message
2. Verify the test is using `TestRepository` or has proper config
3. Run tests with `SUPPRESS_GIT_CONFIG_WARNING=1` to hide the warning

### Tests fail with "Please tell me who you are"

The test isn't setting user info properly. Ensure:
1. The test uses `TestRepository.init()`
2. Or manually sets user config before commits

### Tests behave differently on different machines

Check for:
1. Different git versions (`git --version`)
2. System git config (`git config --system --list`)
3. Environment variables (`env | grep GIT`)

### Running individual tests

When running tests outside of Jest, set the environment manually:

```bash
# Disable global git config for a single command
GIT_CONFIG_NOSYSTEM=1 HOME=/tmp npm test path/to/test.js

# Or export for the session
export GIT_CONFIG_NOSYSTEM=1
export GPG_TTY=''
npm test
```

## Testing Your Git Configuration

Run the git config isolation test:

```bash
npm test test/helpers/git-config.test.js
```

This verifies that:
- Commits work without GPG signing
- Git config is isolated from global settings
- Environment variables are set correctly
- All git operations use test configuration

## Best Practices

1. **Always use TestRepository** for integration tests that need git
2. **Use MockRepository** for unit tests (no real git needed)
3. **Don't rely on global git config** in tests
4. **Set explicit config** for any special git behavior needed
5. **Test on CI** to ensure tests work in clean environments

## For CI/CD

The test configuration is designed to work in CI environments:
- No interactive prompts
- No credential helpers
- No GPG requirements
- Consistent behavior across platforms

## Manual Override

If you need to test with specific git config:

```javascript
const repo = new TestRepository();
await repo.init();

// Override specific settings
await repo.git('config --local merge.ff true');
await repo.git('config --local pull.rebase true');
```

## Debug Mode

To see what git config is being used in tests:

```javascript
// In your test
const config = await repo.git('config --list --local');
console.log('Local config:', config.stdout);

const globalConfig = await repo.exec('git config --list --global');
console.log('Global config:', globalConfig.stdout);
```