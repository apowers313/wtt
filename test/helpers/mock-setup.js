/**
 * Helper for creating consistent mock objects for tests
 */
class MockSetup {
  /**
   * Create a mock gitOps object
   * @param {Object} overrides - Specific overrides for the mock
   * @returns {Object} Mock gitOps object
   */
  static gitOps(overrides = {}) {
    return {
      getCurrentBranch: jest.fn().mockResolvedValue('main'),
      getBranches: jest.fn().mockResolvedValue(['main', 'develop']),
      hasUncommittedChanges: jest.fn().mockResolvedValue(false),
      getWorktrees: jest.fn().mockResolvedValue([]),
      createWorktree: jest.fn().mockResolvedValue({
        success: true,
        path: '.worktrees/wt-feature',
        branch: 'feature'
      }),
      removeWorktree: jest.fn().mockResolvedValue({ success: true }),
      checkoutBranch: jest.fn().mockResolvedValue({ success: true }),
      createBranch: jest.fn().mockResolvedValue({ success: true }),
      deleteBranch: jest.fn().mockResolvedValue({ success: true }),
      getStatus: jest.fn().mockResolvedValue({
        isClean: true,
        modified: [],
        added: [],
        deleted: [],
        conflicted: []
      }),
      merge: jest.fn().mockResolvedValue({ success: true }),
      getMainBranch: jest.fn().mockResolvedValue('main'),
      isInWorktree: jest.fn().mockResolvedValue(false),
      getCurrentWorktree: jest.fn().mockResolvedValue(null),
      stashCreate: jest.fn().mockResolvedValue({ success: true, stashId: 'stash@{0}' }),
      stashApply: jest.fn().mockResolvedValue({ success: true }),
      ...overrides
    };
  }

  /**
   * Create a mock portManager object
   * @param {Object} ports - Initial port assignments
   * @returns {Object} Mock portManager object
   */
  static portManager(ports = {}) {
    const portMap = { ...ports };
    
    return {
      loadPortMap: jest.fn().mockResolvedValue(portMap),
      savePortMap: jest.fn().mockResolvedValue(true),
      assignPorts: jest.fn().mockImplementation((worktreeName) => {
        const assigned = {
          vite: 3000 + Object.keys(portMap).length,
          storybook: 6006 + Object.keys(portMap).length,
          custom: 8080 + Object.keys(portMap).length
        };
        portMap[worktreeName] = assigned;
        return Promise.resolve(assigned);
      }),
      releasePorts: jest.fn().mockImplementation((worktreeName) => {
        delete portMap[worktreeName];
        return Promise.resolve(true);
      }),
      getAssignedPorts: jest.fn().mockImplementation((worktreeName) => {
        return Promise.resolve(portMap[worktreeName] || null);
      }),
      getPortMap: jest.fn().mockResolvedValue(portMap),
      isPortAvailable: jest.fn().mockResolvedValue(true),
      findAvailablePort: jest.fn().mockResolvedValue(3000)
    };
  }

  /**
   * Create a mock config object
   * @param {Object} overrides - Configuration overrides
   * @returns {Object} Mock config object
   */
  static config(overrides = {}) {
    const defaultConfig = {
      worktreeDir: '.worktrees',
      mainBranch: 'main',
      ports: {
        vite: { start: 3000, end: 3099 },
        storybook: { start: 6006, end: 6106 },
        custom: { start: 8080, end: 8180 }
      },
      naming: {
        prefix: 'wt-',
        pattern: 'PREFIX{BRANCH}'
      },
      cleanup: {
        removeOnMerge: true,
        staleAfterDays: 30
      }
    };

    const mockConfig = {
      load: jest.fn().mockResolvedValue({ ...defaultConfig, ...overrides }),
      save: jest.fn().mockResolvedValue(true),
      get: jest.fn().mockImplementation((key) => {
        const config = { ...defaultConfig, ...overrides };
        return key.split('.').reduce((obj, k) => obj?.[k], config);
      }),
      set: jest.fn().mockResolvedValue(true),
      getWorktreeDir: jest.fn().mockReturnValue(overrides.worktreeDir || '.worktrees'),
      getMainBranch: jest.fn().mockReturnValue(overrides.mainBranch || 'main'),
      getPortConfig: jest.fn().mockReturnValue(defaultConfig.ports)
    };

    return mockConfig;
  }

  /**
   * Create a mock file system object
   * @returns {Object} Mock file system object
   */
  static fileSystem() {
    const files = new Map();
    
    return {
      readFile: jest.fn().mockImplementation((path) => {
        if (files.has(path)) {
          return Promise.resolve(files.get(path));
        }
        return Promise.reject(new Error(`File not found: ${path}`));
      }),
      writeFile: jest.fn().mockImplementation((path, content) => {
        files.set(path, content);
        return Promise.resolve();
      }),
      exists: jest.fn().mockImplementation((path) => {
        return Promise.resolve(files.has(path));
      }),
      mkdir: jest.fn().mockResolvedValue(true),
      remove: jest.fn().mockImplementation((path) => {
        files.delete(path);
        return Promise.resolve();
      }),
      readdir: jest.fn().mockImplementation((path) => {
        const entries = [];
        for (const [filePath] of files) {
          if (filePath.startsWith(path + '/')) {
            const relative = filePath.substring(path.length + 1);
            const nextSlash = relative.indexOf('/');
            const entry = nextSlash === -1 ? relative : relative.substring(0, nextSlash);
            if (!entries.includes(entry)) {
              entries.push(entry);
            }
          }
        }
        return Promise.resolve(entries);
      }),
      _files: files,
      _reset: () => files.clear()
    };
  }

  /**
   * Create a mock shell object
   * @returns {Object} Mock shell object
   */
  static shell() {
    return {
      exec: jest.fn().mockResolvedValue({
        stdout: '',
        stderr: '',
        code: 0
      }),
      spawn: jest.fn().mockReturnValue({
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'close') {
            setTimeout(() => cb(0), 0);
          }
        }),
        kill: jest.fn()
      }),
      which: jest.fn().mockResolvedValue('/usr/bin/bash')
    };
  }

  /**
   * Create a mock inquirer object for interactive prompts
   * @param {Object} answers - Predefined answers
   * @returns {Object} Mock inquirer object
   */
  static inquirer(answers = {}) {
    return {
      prompt: jest.fn().mockImplementation((questions) => {
        const result = {};
        const questionArray = Array.isArray(questions) ? questions : [questions];
        
        questionArray.forEach(q => {
          if (answers[q.name] !== undefined) {
            result[q.name] = answers[q.name];
          } else if (q.default !== undefined) {
            result[q.name] = q.default;
          } else {
            result[q.name] = null;
          }
        });
        
        return Promise.resolve(result);
      }),
      registerPrompt: jest.fn()
    };
  }

  /**
   * Create a complete mock environment
   * @param {Object} options - Options for mock setup
   * @returns {Object} Complete mock environment
   */
  static createMockEnvironment(options = {}) {
    return {
      gitOps: this.gitOps(options.gitOps),
      portManager: this.portManager(options.ports),
      config: this.config(options.config),
      fs: this.fileSystem(),
      shell: this.shell(),
      inquirer: this.inquirer(options.inquirerAnswers)
    };
  }
}

module.exports = MockSetup;