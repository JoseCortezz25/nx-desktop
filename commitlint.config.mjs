export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'chore',
        'docs',
        'test',
        'style',
        'refactor',
        'perf',
        'build',
        'ci',
        'revert'
      ]
    ],
    'subject-case': [0]
  }
};
