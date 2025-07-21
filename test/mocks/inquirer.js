// Global inquirer mock for Jest
module.exports = {
  prompt: jest.fn().mockImplementation(async (questions) => {
    // Default responses for common prompt types
    const results = {};
    const questionArray = Array.isArray(questions) ? questions : [questions];
    
    for (const question of questionArray) {
      const name = question.name;
      
      // Provide reasonable defaults based on prompt type and common names
      switch (question.type) {
      case 'confirm':
        // For merge operations, default to true (confirm merges)
        if (name === 'confirmDelete' || name === 'confirmMerge' || question.message?.includes('merge')) {
          results[name] = true;
        } else {
          results[name] = question.default !== undefined ? question.default : false;
        }
        break;
      case 'input':
        results[name] = question.default || '';
        break;
      case 'list':
      case 'rawlist':
      case 'expand':
      case 'checkbox':
        results[name] = question.choices && question.choices.length > 0 
          ? (question.choices[0].value || question.choices[0]) 
          : undefined;
        break;
      default:
        results[name] = question.default;
      }
    }
    
    return results;
  })
};