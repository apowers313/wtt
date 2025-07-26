#!/usr/bin/env node

/**
 * Demonstration of the help topics system
 */

const HelpTopics = require('../lib/help-topics');

const helpTopics = new HelpTopics();

console.log('🔧 WTT Help Topics System Demo\n');

// Show topic list
console.log('=== Available Topics ===');
helpTopics.listTopics();

console.log('\n=== Sample Topic: Getting Started ===');
helpTopics.showTopic('getting-started');

console.log('\n=== Sample Topic: Merge Conflicts ===');
helpTopics.showTopic('merge-conflicts');