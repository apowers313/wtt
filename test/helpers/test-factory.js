const MockRepository = require('./mock-repository');
const TestHelpers = require('./test-helpers');

/**
 * Factory for creating common test scenarios
 */
class TestFactory {
  static async createScenario(type) {
    const scenarios = {
      'clean-repo': this.cleanRepo,
      'with-worktree': this.repoWithWorktree,
      'merge-conflict': this.repoWithConflict,
      'multiple-worktrees': this.repoWithMultipleWorktrees,
      'dirty-worktree': this.repoWithUncommittedChanges
    };
    
    if (!scenarios[type]) {
      throw new Error(`Unknown scenario: ${type}`);
    }
    
    return await scenarios[type].call(this);
  }

  static async cleanRepo() {
    const repo = new MockRepository();
    await repo.init();
    return { repo, helpers: new TestHelpers(repo) };
  }

  static async repoWithWorktree(name = 'feature') {
    const { repo, helpers } = await this.cleanRepo();
    await repo.createBranch(name);
    await repo.createWorktree(name);
    return { repo, helpers, worktreeName: name };
  }

  static async repoWithConflict() {
    const { repo, helpers } = await this.cleanRepo();
    
    // Create conflicting branches
    await repo.createBranch('feature1');
    await repo.writeFile('test.txt', 'feature1 content');
    await repo.commit('Feature 1 change');
    
    await repo.checkout('main');
    await repo.createBranch('feature2');
    await repo.writeFile('test.txt', 'feature2 content');
    await repo.commit('Feature 2 change');
    
    return { repo, helpers };
  }

  static async repoWithMultipleWorktrees(count = 3) {
    const { repo, helpers } = await this.cleanRepo();
    const worktreeNames = [];
    
    for (let i = 1; i <= count; i++) {
      const name = `feature${i}`;
      await repo.createBranch(name);
      await repo.createWorktree(name);
      worktreeNames.push(name);
    }
    
    return { repo, helpers, worktreeNames };
  }

  static async repoWithUncommittedChanges(worktreeName = 'feature') {
    const { repo, helpers } = await this.repoWithWorktree(worktreeName);
    
    // Add uncommitted changes
    await repo.writeFile('uncommitted.txt', 'changes not committed');
    repo.mockGit.state.status.isClean = false;
    repo.mockGit.state.status.modified = ['uncommitted.txt'];
    
    return { repo, helpers, worktreeName };
  }
}

module.exports = TestFactory;