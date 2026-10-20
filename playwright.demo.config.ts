import { defineConfig, devices } from '@playwright/test';
import { DEMO_FORBIDDEN_VARS } from './src/lib/demo-env';

/**
 * Modo só demo (ADR-0043): o build de produção (`pnpm build` antes) sobe com DEMO_ONLY=true e SEM nenhuma
 * credencial do app completo. Nada de banco, globalSetup ou sessão: se algum caminho da demo precisasse
 * deles, a subida (parseDemoEnv) ou a página falharia aqui.
 *
 * APP_ENV=test, como nos outros e2e: em produção a CSP pede `upgrade-insecure-requests`, que quebra em
 * http://localhost. As regras de produção do ambiente da demo (https, região, cabeçalho de IP) têm teste
 * unitário (src/lib/demo-env.test.ts).
 */
const PORT = 3200;
const isCI = Boolean(process.env.CI);

// O Next carrega o .env local, mas não sobrescreve variável já definida: em branco, elas contam como ausentes.
const blankCredentials = Object.fromEntries(DEMO_FORBIDDEN_VARS.map((key) => [key, '']));

export default defineConfig({
  testDir: './e2e/demo-only',
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
    {
      name: 'demo-only',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--lang=pt-BR'] } },
    },
  ],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/demo`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...blankCredentials,
      DEMO_ONLY: 'true',
      APP_ENV: 'test',
      APP_URL: `http://localhost:${PORT}`,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
