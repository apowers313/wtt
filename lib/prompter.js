/**
 * Prompter interface for user interaction
 * Allows dependency injection for testing
 */

const inquirer = require('inquirer');

class Prompter {
  async confirm(message, defaultValue = false) {
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue
    }]);
    return confirmed;
  }

  async select(message, choices) {
    const { selected } = await inquirer.prompt([{
      type: 'list',
      name: 'selected',
      message,
      choices
    }]);
    return selected;
  }

  async input(message, defaultValue = '') {
    const { value } = await inquirer.prompt([{
      type: 'input',
      name: 'value',
      message,
      default: defaultValue
    }]);
    return value;
  }
}

// Test double for automated testing
class TestPrompter {
  constructor(responses = {}) {
    this.responses = responses;
    this.callCount = 0;
  }

  async confirm(message, defaultValue = false) {
    const key = `confirm_${this.callCount++}`;
    return this.responses[key] !== undefined ? this.responses[key] : defaultValue;
  }

  async select(message, choices) {
    const key = `select_${this.callCount++}`;
    return this.responses[key] !== undefined ? this.responses[key] : choices[0];
  }

  async input(message, defaultValue = '') {
    const key = `input_${this.callCount++}`;
    return this.responses[key] !== undefined ? this.responses[key] : defaultValue;
  }
}

module.exports = { Prompter, TestPrompter };