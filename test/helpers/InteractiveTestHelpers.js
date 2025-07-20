/**
 * Helpers for testing interactive CLI commands
 */
class InteractiveTestHelpers {
  /**
   * Create inquirer mock with predefined answers
   */
  static mockInquirer(answers = {}) {
    return {
      prompt: jest.fn().mockImplementation(async (questions) => {
        const results = {};
        
        const questionArray = Array.isArray(questions) ? questions : [questions];
        
        for (const question of questionArray) {
          const name = question.name;
          
          // Use provided answer or default
          if (answers[name] !== undefined) {
            results[name] = answers[name];
          } else if (question.default !== undefined) {
            results[name] = question.default;
          } else if (question.type === 'confirm') {
            results[name] = false; // Safe default
          } else {
            results[name] = '';
          }
        }
        
        return results;
      })
    };
  }

  /**
   * Mock for testing different confirmation scenarios
   */
  static mockConfirmationFlow(confirmations) {
    let callCount = 0;
    return {
      prompt: jest.fn().mockImplementation(async (question) => {
        const confirmation = confirmations[callCount] || false;
        callCount++;
        return { [question.name]: confirmation };
      })
    };
  }

  /**
   * Create a mock that simulates user selecting from a list
   */
  static mockSelection(selection) {
    return {
      prompt: jest.fn().mockResolvedValue({ 
        selection: selection 
      })
    };
  }

  /**
   * Setup module mocks before tests
   */
  static setupMocks() {
    // Clear all mocks
    jest.clearAllMocks();
    jest.resetModules();
    
    // Common mocks that many tests need
    jest.mock('chalk', () => ({
      green: (str) => str,
      red: (str) => str,
      yellow: (str) => str,
      blue: (str) => str,
      gray: (str) => str,
      bold: (str) => str
    }));
  }
}

/**
 * Helpers for async operations and timing
 */
class AsyncTestHelpers {
  /**
   * Wait for a condition to be true with timeout
   */
  static async waitFor(condition, options = {}) {
    const { timeout = 5000, interval = 100, message = 'Condition not met' } = options;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const result = await condition();
        if (result) return result;
      } catch (error) {
        // Ignore errors during polling
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Timeout waiting for condition: ${message}`);
  }

  /**
   * Retry an operation with exponential backoff
   */
  static async retry(operation, options = {}) {
    const { maxAttempts = 3, initialDelay = 100, maxDelay = 1000 } = options;
    let lastError;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxAttempts - 1) {
          const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Wait for file to exist
   */
  static async waitForFile(repo, filepath, timeout = 5000) {
    return this.waitFor(
      () => repo.exists(filepath),
      { timeout, message: `File ${filepath} not created` }
    );
  }

  /**
   * Wait for process to be ready (useful for services)
   */
  static async waitForPort(port, timeout = 10000) {
    const net = require('net');
    
    return this.waitFor(
      () => new Promise((resolve) => {
        const socket = new net.Socket();
        
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });
        
        socket.on('error', () => {
          socket.destroy();
          resolve(false);
        });
        
        socket.connect(port, '127.0.0.1');
      }),
      { timeout, message: `Port ${port} not ready` }
    );
  }
}

/**
 * Test data builders for common scenarios
 */
class TestDataBuilders {
  /**
   * Create a test configuration
   */
  static createConfig(overrides = {}) {
    return {
      baseDir: '.worktrees',
      portRanges: {
        vite: { start: 3000, increment: 10 },
        storybook: { start: 6006, increment: 10 },
        custom: { start: 8000, increment: 10 }
      },
      mainBranch: 'main',
      namePattern: 'wt-{branch}',
      autoCleanup: true,
      ...overrides
    };
  }

  /**
   * Create test port map data
   */
  static createPortMap(worktrees = {}) {
    const defaultPorts = {
      vite: 3000,
      storybook: 6006,
      custom: 8000
    };
    
    const portMap = {};
    let portOffset = 0;
    
    for (const [name, services] of Object.entries(worktrees)) {
      portMap[name] = {
        created: new Date().toISOString()
      };
      
      services.forEach(service => {
        portMap[name][service] = defaultPorts[service] + portOffset;
      });
      
      portOffset += 10;
    }
    
    return portMap;
  }

  /**
   * Create test environment file content
   */
  static createEnvContent(worktreeName, ports) {
    const lines = [
      `# Worktree-specific environment variables`,
      `# Generated by wtt for ${worktreeName}`,
      '',
      ...Object.entries(ports).map(([service, port]) => 
        `${service.toUpperCase()}_PORT=${port}`
      ),
      `WORKTREE_NAME=${worktreeName}`,
      `WORKTREE_BRANCH=${worktreeName.replace('wt-', '')}`,
      ''
    ];
    
    return lines.join('\n');
  }
}

module.exports = {
  InteractiveTestHelpers,
  AsyncTestHelpers,
  TestDataBuilders
};