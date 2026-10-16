import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src-tauri/**',
      'docs/wireframes/**',
      '.claude/hooks/**',
      '.opencode/hooks/**',
      'scripts/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports'
        }
      ],
      'no-console': 'warn',
      camelcase: [
        'error',
        {
          properties: 'always',
          allow: [
            'validation_failed',
            'permission_denied',
            'provider_unavailable',
            'internal_error',
            'ask_always',
            'auto_approve',
            'full_access',
            'list_files'
          ]
        }
      ]
    }
  }
);
