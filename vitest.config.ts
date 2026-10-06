import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  '@messages': fileURLToPath(new URL('./messages', import.meta.url)),
  'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
          exclude: ['e2e/**', 'node_modules/**', 'tests/db/**'],
        },
      },
      {
        // Integração com Postgres real (RLS, sessões, limites). Exige `pnpm db:up` e migrações aplicadas.
        // ATENÇÃO: limpa as tabelas de auth do banco apontado pelo .env (só dados sintéticos em dev).
        extends: true,
        test: {
          name: 'db',
          globals: true,
          environment: 'node',
          include: ['tests/db/**/*.test.ts'],
          globalSetup: ['./tests/db/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
