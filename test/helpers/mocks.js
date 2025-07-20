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