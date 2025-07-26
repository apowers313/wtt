#!/usr/bin/env node

/**
 * Example showing the difference between old verbose output and new concise output
 */

const Output = require('../lib/output');

console.log('=== OLD OUTPUT STYLE (verbose) ===\n');

console.log('⚡bar /tmp/foo/.worktrees/bar ▶ wt merge');
console.log('Auto-detected current worktree: bar');
console.log('Checking worktree \'bar\'...');
console.log('🔒 Creating safety backup...');
console.log('  - Branch state saved');
console.log('✅ Safety backup created');
console.log('   Backup ID: merge-2025-07-25T15-18-35-429Z');
console.log('   Recovery: wt restore --backup merge-2025-07-25T15-18-35-429Z');
console.log('🔍 Checking for conflicts...');
console.log('✅ No conflicts detected');
console.log('🔄 Switching to main branch...');
console.log('✅ Successfully switched to main');
console.log('🔄 Merging bar into main...');
console.log('✅ Merge completed successfully');
console.log('🧹 Cleaning up worktree...');
console.log('✅ Worktree removed');
console.log('✅ Ports released');

console.log('\n=== NEW OUTPUT STYLE (normal) ===\n');

const output = new Output({ verbose: false });
output.status('merge', 'merging', 'bar → main');
output.success('merge', 'merged \'bar\' into main and removed worktree');

console.log('\n=== NEW OUTPUT STYLE (verbose) ===\n');

const verboseOutput = new Output({ verbose: true });
verboseOutput.verboseStep('merge', 'auto-detected current worktree: bar');
verboseOutput.verboseStep('merge', 'target branch: main');
verboseOutput.verboseStep('merge', 'checked out main');
verboseOutput.status('merge', 'merging', 'bar → main');
verboseOutput.verboseStep('merge', 'merge completed successfully');
verboseOutput.verboseStep('merge', 'cleaning up worktree');
verboseOutput.verboseStep('merge', 'worktree and ports cleaned up');
verboseOutput.success('merge', 'merged \'bar\' into main and removed worktree');

console.log('\n=== ERROR EXAMPLES ===\n');

const errorOutput = new Output({ verbose: false });
errorOutput.error('merge', 'conflicts in 2 files (run \'git status\' for details)');

const verboseErrorOutput = new Output({ verbose: true });
verboseErrorOutput.error('merge', 'validation failed', '3 validation errors found');

console.log('\nAs you can see, the new system is much more concise while still providing\nthe same information. Verbose mode gives details when needed.');