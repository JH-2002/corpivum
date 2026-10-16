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
    // LEG-S03: só src/lib/db, a fila Postgres e os serviços de auth/consent/privacy (funções SECURITY
    // DEFINER e injeção do client nos testes) usam o client cru. O resto acessa dados por
    // `withUser`/`forUser` de '@/lib/db', que fixam app.user_id (ADR-0015, ADR-0019).
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/lib/db/**',
      'src/modules/auth/**',
      'src/modules/consent/**',
      'src/modules/privacy/**',
      'src/adapters/jobs/**',
      // Exportação (ADR-0032): função SECURITY DEFINER de expiração e injeção do client nos testes.
      'src/modules/reports/service.ts',
      'src/modules/reports/server.ts',
      // Reconciliação dos lembretes (ADR-0037): lista de IDs pelo client dos jobs (`app_worker`).
      'src/modules/notifications/jobs.ts',
      // Alerta de volume (ADR-0038): só a função de amostra, pelo client dos jobs (`app_worker`).
      'src/modules/observability/volume.ts',
      'src/modules/observability/volume.test.ts',
      'src/server-jobs.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/lib/db/client',
                '@/lib/db/rls',
                '@/generated/prisma',
                '@/generated/prisma/*',
              ],
              message: 'Use withUser/forUser de @/lib/db (LEG-S03, ADR-0015).',
            },
          ],
        },
      ],
    },
  },
  {
    // ADR-0014: segredos só são comparados com constantTimeEqual.
    files: ['src/modules/auth/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['left', 'right'].flatMap((side) =>
          ['name', 'property.name'].map((prop) => ({
            selector: `BinaryExpression[operator=/^[!=]==?$/][${side}.${prop}=/(token|hash|code|secret|sig|otp)/i]`,
            message: 'Compare segredos com constantTimeEqual (ADR-0014).',
          })),
        ),
      ],
    },
  },
  {
    files: ['scripts/**', 'tests/**', 'e2e/**', '**/*.config.*'],
    rules: { 'no-console': 'off' },
  },
  prettier,
];

export default config;
