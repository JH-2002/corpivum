import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

const config = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'src/generated/**',
      'next-env.d.ts',
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    // jsx-a11y já é registrado pelo eslint-config-next; aqui só elevamos para o conjunto "strict" (LEG-X01).
    files: ['**/*.{ts,tsx}'],
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Regra 5 do CLAUDE.md: usar o logger de metadados em vez de console.
      'no-console': 'error',
    },
  },
  {
    files: ['scripts/**', 'tests/**', 'e2e/**', '**/*.config.*'],
    rules: { 'no-console': 'off' },
  },
  prettier,
];

export default config;
