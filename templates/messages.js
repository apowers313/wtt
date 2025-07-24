
const MERGE_MESSAGES = {
  uncommittedChanges: {
    title: 'You have unsaved changes',
    explanation: 'These changes would be lost if we merge now.',
    options: [
      {
        label: 'Save changes temporarily (recommended)',
        command: 'git stash save \'Work in progress before merge\'',
        wttCommand: 'wt save-work',
        safe: true,
        skill: 'beginner',
        description: 'Safely stores your changes so you can get them back later'
      },
      {
        label: 'Commit your changes first',
        command: 'git commit -m \'Work in progress\'',
        wttCommand: 'wt commit -m \'Work in progress\'',
        safe: true,
        skill: 'intermediate',
        description: 'Creates a permanent record of your current changes'
      },
      {
        label: 'Discard your changes (careful!)',
        command: 'git reset --hard',
        wttCommand: 'wt reset --hard',
        safe: false,
        skill: 'advanced',
        warning: 'This permanently deletes uncommitted changes',
        description: '⚠️  WARNING: This will permanently delete all your uncommitted work'
      }
    ]
  },

  conflictMarkers: {
    title: 'Merge conflicts detected',
    explanation: 'Both branches changed the same code in different ways. You need to choose which changes to keep.',
    options: [
      {
        label: 'Resolve conflicts interactively (recommended)',
        command: 'wt conflicts fix --interactive',
        safe: true,
        skill: 'beginner',
        description: 'Guide you through each conflict step by step'
      },
      {
        label: 'Open in your editor',
        command: 'git mergetool',
        wttCommand: 'wt conflicts fix --tool=editor',
        safe: true,
        skill: 'intermediate',
        description: 'Opens conflicts in your configured merge tool'
      },
      {
        label: 'Accept all changes from one side',
        command: 'git checkout --ours/--theirs <files>',
        wttCommand: 'wt conflicts accept --ours OR --theirs',
        safe: false,
        skill: 'advanced',
        warning: 'Review changes carefully before committing',
        description: '⚠️  Choose all changes from either your branch or theirs'
      }
    ]
  },

  divergedBranches: {
    title: 'Branches have diverged',
    explanation: 'Your branch and the target branch have different commits. They need to be combined.',
    options: [
      {
        label: 'Merge branches (preserves history)',
        command: 'git pull --no-rebase',
        wttCommand: 'wt pull --merge',
        safe: true,
        skill: 'beginner',
        description: 'Creates a merge commit combining both histories'
      },
      {
        label: 'Rebase your changes (linear history)',
        command: 'git pull --rebase',
        wttCommand: 'wt pull --rebase',
        safe: true,
        skill: 'intermediate',
        description: 'Replays your changes on top of the latest target branch',
        warning: 'Only use on personal branches'
      },
      {
        label: 'Create backup branch first',
        command: 'git checkout -b backup && git checkout original && git reset --hard origin/branch',
        wttCommand: 'wt branch save-current',
        safe: false,
        skill: 'advanced',
        description: '⚠️  Saves current work to new branch, then resets main branch'
      }
    ]
  },

  missingBranch: {
    title: 'Target branch not found',
    explanation: 'The branch you\'re trying to merge into doesn\'t exist in this repository.',
    options: [
      {
        label: 'Create the branch first',
        command: 'git checkout -b main',
        wttCommand: 'wt create-branch main',
        safe: true,
        skill: 'beginner',
        description: 'Creates the missing branch so you can merge'
      },
      {
        label: 'Check available branches',
        command: 'git branch -a',
        wttCommand: 'wt list --all',
        safe: true,
        skill: 'beginner',
        description: 'Shows all branches to see what\'s available'
      },
      {
        label: 'Merge to a different branch',
        command: 'git checkout existing-branch && git merge current-branch',
        wttCommand: 'wt merge --to existing-branch',
        safe: true,
        skill: 'intermediate',
        description: 'Merge into a branch that actually exists'
      }
    ]
  },

  noFastForward: {
    title: 'Cannot fast-forward merge',
    explanation: 'The target branch has new commits that conflict with your merge.',
    options: [
      {
        label: 'Create merge commit',
        command: 'git merge --no-ff',
        safe: true,
        skill: 'beginner',
        description: 'Creates a merge commit even if fast-forward is possible'
      },
      {
        label: 'Rebase before merging',
        command: 'git rebase target-branch',
        safe: true,
        skill: 'intermediate',
        description: 'Updates your branch with latest changes, then merges'
      }
    ]
  },

  binaryConflict: {
    title: 'Binary file conflict',
    explanation: 'Both branches have different versions of a binary file (image, PDF, etc.).',
    options: [
      {
        label: 'Keep your version',
        command: 'git checkout --ours <file>',
        wttCommand: 'wt binary keep --ours <file>',
        safe: true,
        skill: 'beginner',
        description: 'Use the version from your branch'
      },
      {
        label: 'Keep their version',
        command: 'git checkout --theirs <file>',
        wttCommand: 'wt binary keep --theirs <file>',
        safe: true,
        skill: 'beginner',
        description: 'Use the version from the target branch'
      },
      {
        label: 'Keep both versions',
        command: 'manual file management',
        wttCommand: 'wt binary keep-both <file>',
        safe: true,
        skill: 'intermediate',
        description: 'Saves both versions with different names'
      }
    ]
  },

  detachedHead: {
    title: 'Detached HEAD state',
    explanation: 'You\'re not on a branch. Your changes might be lost if you switch branches.',
    options: [
      {
        label: 'Create new branch from current state',
        command: 'git checkout -b new-branch-name',
        wttCommand: 'wt branch create-from-current',
        safe: true,
        skill: 'beginner',
        description: 'Save your current work in a new branch'
      },
      {
        label: 'Return to previous branch',
        command: 'git checkout previous-branch',
        safe: true,
        skill: 'intermediate',
        description: 'Go back to your previous branch (may lose current changes)'
      }
    ]
  }
};

// Error pattern matching
const ERROR_PATTERNS = {
  uncommittedChanges: [
    /would be overwritten by merge/i,
    /Your local changes to the following files would be overwritten/i,
    /Please commit your changes or stash them/i
  ],
  conflictMarkers: [
    /Automatic merge failed.*fix conflicts/i,
    /CONFLICT.*Merge conflict/i,
    /You have unmerged paths/i,
    /There are conflicts in some files/i,
    /There are merge conflicts/i
  ],
  divergedBranches: [
    /Your branch and.*have diverged/i,
    /and have \d+ and \d+ different commits each/i,
    /hint: You have divergent branches/i
  ],
  missingBranch: [
    /pathspec '.*' did not match any file\(s\) known to git/i,
    /branch '.*' not found/i
  ],
  noFastForward: [
    /fatal: Not possible to fast-forward/i,
    /hint: You have divergent branches and need to specify/i
  ],
  binaryConflict: [
    /warning: Cannot merge binary files/i,
    /CONFLICT.*binary file/i
  ],
  detachedHead: [
    /You are in 'detached HEAD' state/i,
    /HEAD detached at/i,
    /HEAD detached from/i
  ]
};

module.exports = {
  MERGE_MESSAGES,
  ERROR_PATTERNS
};