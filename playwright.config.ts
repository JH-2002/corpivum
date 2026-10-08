import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { pointToTestDatabase } from './tests/db/safety';

// O e2e grava e apaga dados: aponta este processo, os workers e o servidor para o banco de TESTES
// (ADR-0024). Recusa rodar se a URL for a do banco de desenvolvimento.
pointToTestDatabase();

const PORT = 3100;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [
    // Cria a pessoa sintética e salva a sessão; os testes do app reutilizam (Fase 1a, LEG-S04).
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/pessoa.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    // No CI roda contra o build de produção (gerado antes, no job); localmente, contra o dev server.
    command: isCI ? `pnpm start --port ${PORT}` : `pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}/entrar`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: {
      APP_ENV: 'test',
      NEXT_TELEMETRY_DISABLED: '1',
      APP_URL: `http://localhost:${PORT}`,
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL ?? '',
    },
  },
});
