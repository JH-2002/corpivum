import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { pointToTestDatabase } from './tests/db/safety';

// O e2e grava e apaga dados: aponta este processo, os workers e o servidor para o banco de TESTES
// (ADR-0024). Recusa rodar se a URL for a do banco de desenvolvimento.
pointToTestDatabase();

const PORT = 3100;
const isCI = Boolean(process.env.CI);
/** Build de produção também fora da CI (medição de performance: `E2E_PROD=1 pnpm test:perf`). */
/**
 * Vídeo de revisão do movimento (`pnpm video:movimento`): também no build de produção, o que vai ao ar. Os workers
 * releem esta config sem os argumentos da linha de comando: a marca vai numa variável que eles herdam.
 */
if (
  process.argv.some(
    (arg, i, all) => arg === '--project=video' || (arg === '--project' && all[i + 1] === 'video'),
  )
) {
  process.env.HM_RECORD_VIDEO = '1';
}
const recordingVideo = process.env.HM_RECORD_VIDEO === '1';
const useProductionBuild = isCI || process.env.E2E_PROD === '1' || recordingVideo;

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
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/pessoa.json',
        // Campos de data e hora no formato brasileiro também no Chromium da CI (Linux).
        launchOptions: { args: ['--lang=pt-BR'] },
      },
      dependencies: ['setup'],
      // O modo só demo tem config própria (playwright.demo.config.ts, ADR-0043): outro servidor, sem banco.
      testIgnore: [/perf\.spec\.ts/, /demo-only[\\/]/],
    },
    // Orçamento de performance (§41, ADR-0039): job próprio na CI, sem paralelismo, só no build de produção.
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      fullyParallel: false,
    },
    // Vídeo de revisão do movimento (9f, ADR-0055): só sob demanda (`pnpm video:movimento`), nunca na suíte.
    ...(recordingVideo
      ? [
          {
            name: 'video',
            testMatch: /\.video\.ts$/,
            use: {
              ...devices['Desktop Chrome'],
              storageState: 'e2e/.auth/pessoa.json',
              launchOptions: { args: ['--lang=pt-BR'] },
            },
            dependencies: ['setup'],
          },
        ]
      : []),
  ],
  webServer: {
    // No CI roda contra o build de produção (gerado antes, no job); localmente, contra o dev server.
    // O servidor sobe ANTES do globalSetup: no CI, migra o banco de testes primeiro, senão os jobs da subida
    // (expurgos e varreduras, ADR-0035) rodam contra um banco vazio e falham.
    command: useProductionBuild
      ? `pnpm exec prisma migrate deploy && pnpm start --port ${PORT}`
      : `pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}/entrar`,
    reuseExistingServer: !useProductionBuild,
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
