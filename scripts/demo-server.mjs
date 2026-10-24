// Servidor da demonstração no modo só demo (ADR-0043), compartilhado por `pnpm capturas` e `pnpm readme:midia`:
// build de produção com DEMO_ONLY=true e `next start` sem nenhuma credencial do app completo, como no e2e
// `demo-only`. Dados 100% fictícios (gerador em memória): nada de banco nem de dado real.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_FORBIDDEN_VARS } from '../src/lib/demo-env.ts';

/**
 * Senhas do docker-compose (`.env.example`): o app não as lê, mas o Next carrega o `.env` local; em branco, nada do
 * banco chega ao processo da demo.
 */
const COMPOSE_SECRET_VARS = [
  'POSTGRES_SUPERUSER_PASSWORD',
  'APP_MIGRATOR_PASSWORD',
  'APP_USER_PASSWORD',
  'APP_OPERATOR_PASSWORD',
  'APP_WORKER_PASSWORD',
  'APP_BACKUP_PASSWORD',
];

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const NEXT_BIN = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');

/**
 * @param {{ label: string, port: number, portVar: string }} options `label` prefixa as mensagens; `portVar` é a
 *   variável de ambiente que troca a porta, citada nos erros.
 */
export function createDemoServer({ label, port, portVar }) {
  const base = `http://localhost:${port}`;
  // Credenciais do app completo (DEMO_FORBIDDEN_VARS) em branco contam como ausentes, no build e no servidor: o
  // Next não sobrescreve variável já definida com o .env local. APP_ENV=test como no e2e: em produção a CSP pede
  // `upgrade-insecure-requests`, que quebra em http://localhost.
  const buildEnv = {
    ...process.env,
    ...Object.fromEntries([...DEMO_FORBIDDEN_VARS, ...COMPOSE_SECRET_VARS].map((key) => [key, ''])),
    DEMO_ONLY: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  const demoEnv = { ...buildEnv, APP_ENV: 'test', APP_URL: base };

  function fail(message) {
    console.error(`${label}: ${message}`);
    process.exit(1);
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535)
    fail(`${portVar} precisa ser uma porta válida`);

  /** Recusa porta ocupada: um servidor antigo responderia com outro build. */
  async function assertPortFree() {
    const busy = () => fail(`a porta ${port} está em uso; encerre o processo ou use ${portVar}`);
    // Um servidor preso só a 127.0.0.1 pode não impedir o bind abaixo no Windows: pergunta antes.
    try {
      await fetch(base, { signal: AbortSignal.timeout(2000) });
      busy();
    } catch {
      // ninguém respondeu
    }
    await new Promise((resolve) => {
      const probe = createServer();
      probe.once('error', busy);
      probe.listen(port, () => probe.close(resolve));
    });
  }

  function build() {
    console.log(`${label}: build de produção (DEMO_ONLY=true)...`);
    const result = spawnSync(process.execPath, [NEXT_BIN, 'build'], {
      cwd: ROOT,
      env: buildEnv,
      stdio: 'inherit',
    });
    if (result.status !== 0) fail('o build falhou');
  }

  function startServer() {
    return spawn(process.execPath, [NEXT_BIN, 'start', '--port', String(port)], {
      cwd: ROOT,
      env: demoEnv,
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: !isWindows,
    });
  }

  /** Encerra o servidor e os processos filhos dele. */
  function stopServer(server) {
    if (server.exitCode !== null || server.pid === undefined) return;
    if (isWindows) {
      spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // o grupo já saiu
    }
  }

  async function waitForServer(server) {
    for (let i = 0; i < 60; i++) {
      if (server.exitCode !== null) fail('o servidor encerrou antes de responder');
      try {
        if ((await fetch(`${base}/demo`, { signal: AbortSignal.timeout(5000) })).ok) return;
      } catch {
        // ainda subindo
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    fail('o servidor não respondeu em 60 s');
  }

  /**
   * Sobe o servidor (com build antes, salvo `skipBuild`), roda `task` e encerra tudo o que o servidor abriu,
   * inclusive se `task` falhar ou com Ctrl+C.
   */
  async function run({ skipBuild, task }) {
    await assertPortFree();
    if (!skipBuild) build();
    const server = startServer();
    process.on('exit', () => stopServer(server));
    // Ctrl+C e afins: no POSIX o servidor está noutro grupo de processos e não recebe o sinal do terminal.
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.once(signal, () => {
        stopServer(server);
        process.exit(130);
      });
    }
    try {
      await waitForServer(server);
      await task();
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      stopServer(server);
    }
  }

  return { base, fail, run };
}

/** Espera a página assentar: rede parada, twin do início desenhado (ADR-0049), fontes e o 3D. */
export async function settle(page) {
  await page.waitForLoadState('networkidle');
  // Twin do início (ADR-0049): chega depois da carga; espera o interativo e, com 3D, o modelo desenhado.
  if (await page.locator('section[aria-labelledby="twin-hero-title"]').count()) {
    const mode = page.locator('[data-tour="twin-hero"] [data-twin-mode]');
    await mode.waitFor({ timeout: 30_000 });
    if ((await mode.getAttribute('data-twin-mode')) === '3d') {
      await page.locator('[data-twin-hero-ready]').waitFor({ timeout: 30_000 });
    }
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout((await page.locator('canvas').count()) ? 2500 : 400);
}

/** WebGL por software, como nos e2e do twin: sem ele o headless mostra o twin em 2D. */
export const BROWSER_ARGS = [
  '--lang=pt-BR',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
];

/** Tour já visto: a chave é DEMO_TOUR_STORAGE_KEY (src/components/tour/Tour.tsx), que o loader não lê. */
export function tourSeenState(base) {
  return {
    cookies: [],
    origins: [{ origin: base, localStorage: [{ name: 'hm_tour_demo_seen', value: '1' }] }],
  };
}
