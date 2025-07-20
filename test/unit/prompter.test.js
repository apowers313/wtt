// Mock inquirer before importing
jest.mock('inquirer', () => ({
  prompt: jest.fn()
}));

const { Prompter, TestPrompter } = require('../../lib/prompter');
const inquirer = require('inquirer');

describe('Prompter classes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Prompter', () => {
    test('confirm calls inquirer with correct parameters', async () => {
      inquirer.prompt.mockResolvedValue({ confirmed: true });
      
      const prompter = new Prompter();
      const result = await prompter.confirm('Test message?', false);
      
      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'confirm',
        name: 'confirmed',
        message: 'Test message?',
        default: false
      }]);
      expect(result).toBe(true);
    });

    test('select calls inquirer with correct parameters', async () => {
      inquirer.prompt.mockResolvedValue({ selected: 'option1' });
      
      const prompter = new Prompter();
      const result = await prompter.select('Choose option:', ['option1', 'option2']);
      
      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'list',
        name: 'selected',
        message: 'Choose option:',
        choices: ['option1', 'option2']
      }]);
      expect(result).toBe('option1');
    });

    test('input calls inquirer with correct parameters', async () => {
      inquirer.prompt.mockResolvedValue({ value: 'user input' });
      
      const prompter = new Prompter();
      const result = await prompter.input('Enter value:', 'default');
      
      expect(inquirer.prompt).toHaveBeenCalledWith([{
        type: 'input',
        name: 'value',
        message: 'Enter value:',
        default: 'default'
      }]);
      expect(result).toBe('user input');
    });
  });

  describe('TestPrompter', () => {
    test('confirm returns predefined responses', async () => {
      const prompter = new TestPrompter({
        confirm_0: true,
        confirm_1: false
      });
      
      expect(await prompter.confirm('First question?')).toBe(true);
      expect(await prompter.confirm('Second question?')).toBe(false);
      expect(await prompter.confirm('Third question?', true)).toBe(true); // default
    });

    test('select returns predefined responses', async () => {
      const prompter = new TestPrompter({
        select_0: 'option2',
        select_1: 'option1'
      });
      
      expect(await prompter.select('Choose:', ['option1', 'option2'])).toBe('option2');
      expect(await prompter.select('Choose again:', ['option1', 'option2'])).toBe('option1');
      expect(await prompter.select('Choose third:', ['option1', 'option2'])).toBe('option1'); // default (first)
    });

    test('input returns predefined responses', async () => {
      const prompter = new TestPrompter({
        input_0: 'custom value',
        input_1: 'another value'
      });
      
      expect(await prompter.input('Enter value:')).toBe('custom value');
      expect(await prompter.input('Enter another:')).toBe('another value');
      expect(await prompter.input('Enter third:', 'default')).toBe('default'); // default
    });

    test('call count increments correctly across different prompt types', async () => {
      const prompter = new TestPrompter({
        confirm_0: true,
        select_1: 'selected',
        input_2: 'typed'
      });
      
      expect(await prompter.confirm('Question?')).toBe(true); // confirm_0
      expect(await prompter.select('Choose:', ['a', 'b'])).toBe('selected'); // select_1
      expect(await prompter.input('Type:')).toBe('typed'); // input_2
    });
  });
});