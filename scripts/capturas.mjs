// Capturas de tela da demonstração no modo só demo (ADR-0043, ADR-0044): `pnpm capturas`.
// 1. build de produção com DEMO_ONLY=true (pule com --sem-build se o build já é desse modo);
// 2. sobe `next start` sem nenhuma credencial do app completo, como no e2e `demo-only`;
// 3. captura cada tela da demo e do modo apresentação em desktop (1440 px) e celular (390 px), temas claro e
//    escuro, em `capturas/` (fora do Git), como `<tela>_<tamanho>_<tema>.png`;
// 4. encerra o servidor e tudo o que ele abriu, inclusive se a captura falhar.
// Dados 100% fictícios (gerador em memória): nada de banco nem de dado real.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { DEMO_FORBIDDEN_VARS } from '../src/lib/demo-env.ts';
import { BODY_MODEL_STORAGE_KEY } from '../src/modules/twin/bodyModel.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'capturas');
const PORT = Number(process.env.CAPTURAS_PORT ?? 3300);
const BASE = `http://localhost:${PORT}`;
const skipBuild = process.argv.includes('--sem-build');
const isWindows = process.platform === 'win32';

const PAGES = [
  ['inicio', '/demo'],
  ['sono', '/demo/sono'],
  ['habitos', '/demo/habitos'],
  ['corpo', '/demo/corpo'],
  ['alimentacao', '/demo/alimentacao'],
  ['atividade', '/demo/atividade'],
  ['metas', '/demo/metas'],
  ['timeline', '/demo/timeline'],
  ['twin', '/demo/twin'],
  ['sobre', '/demo/sobre'],
];
const SCREENS = ['painel', 'twin', 'timeline', 'relatorio'];
const SIZES = [
  { name: 'desktop-1440', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  {
    name: 'celular-390',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
];
const THEMES = [
  ['claro', 'light'],
  ['escuro', 'dark'],
];

// Credenciais do app completo (DEMO_FORBIDDEN_VARS) em branco contam como ausentes, no build e no servidor: o
// Next não sobrescreve variável já definida com o .env local. APP_ENV=test como no e2e: em produção a CSP pede
// `upgrade-insecure-requests`, que quebra em http://localhost.
const NEXT_BIN = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
const buildEnv = {
  ...process.env,
  ...Object.fromEntries(DEMO_FORBIDDEN_VARS.map((key) => [key, ''])),
  DEMO_ONLY: 'true',
  NEXT_TELEMETRY_DISABLED: '1',
};
const demoEnv = { ...buildEnv, APP_ENV: 'test', APP_URL: BASE };

function fail(message) {
  console.error(`capturas: ${message}`);
  process.exit(1);
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535)
  fail('CAPTURAS_PORT precisa ser uma porta válida');

/** Recusa porta ocupada: um servidor antigo responderia com outro build. */
async function assertPortFree() {
  const busy = () => fail(`a porta ${PORT} está em uso; encerre o processo ou use CAPTURAS_PORT`);
  // Um servidor preso só a 127.0.0.1 pode não impedir o bind abaixo no Windows: pergunta antes.
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(2000) });
    busy();
  } catch {
    // ninguém respondeu
  }
  await new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', busy);
    probe.listen(PORT, () => probe.close(resolve));
  });
}

function build() {
  console.log('capturas: build de produção (DEMO_ONLY=true)...');
  const result = spawnSync(process.execPath, [NEXT_BIN, 'build'], {
    cwd: ROOT,
    env: buildEnv,
    stdio: 'inherit',
  });
  if (result.status !== 0) fail('o build falhou');
}

function startServer() {
  return spawn(process.execPath, [NEXT_BIN, 'start', '--port', String(PORT)], {
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
      if ((await fetch(`${BASE}/demo`, { signal: AbortSignal.timeout(5000) })).ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail('o servidor não respondeu em 60 s');
}

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout((await page.locator('canvas').count()) ? 2500 : 400);
}

async function capture() {
  mkdirSync(OUT, { recursive: true });
  for (const file of readdirSync(OUT).filter((f) => f.endsWith('.png')))
    rmSync(path.join(OUT, file));
  const browser = await chromium.launch({ args: ['--lang=pt-BR'] });
  let count = 0;
  try {
    for (const size of SIZES) {
      for (const [themeName, colorScheme] of THEMES) {
        const context = await browser.newContext({
          ...size,
          colorScheme,
          reducedMotion: 'reduce',
          locale: 'pt-BR',
          timezoneId: 'America/Sao_Paulo',
          // Tour já visto: a chave é DEMO_TOUR_STORAGE_KEY (src/components/tour/Tour.tsx), que o loader não lê.
          storageState: {
            cookies: [],
            origins: [{ origin: BASE, localStorage: [{ name: 'hm_tour_demo_seen', value: '1' }] }],
          },
        });
        const page = await context.newPage();
        const shot = async (name) => {
          await settle(page);
          // Janela da altura da página: barras fixas (lateral, navegação) ficam onde a pessoa as vê.
          const height = await page.evaluate(() => document.documentElement.scrollHeight);
          await page.setViewportSize({
            width: size.viewport.width,
            height: Math.max(height, size.viewport.height),
          });
          await settle(page);
          await page.screenshot({ path: path.join(OUT, `${name}_${size.name}_${themeName}.png`) });
          await page.setViewportSize(size.viewport);
          count++;
        };
        for (const [name, url] of PAGES) {
          await page.goto(BASE + url);
          await shot(name);
        }
        // Twin com o modelo 3D escolhido; a captura `twin` acima mostra a escolha da primeira visita.
        await page.evaluate((key) => localStorage.setItem(key, 'feminine'), BODY_MODEL_STORAGE_KEY);
        await page.goto(`${BASE}/demo/twin`);
        await shot('twin-com-modelo');
        await page.evaluate((key) => localStorage.removeItem(key), BODY_MODEL_STORAGE_KEY);
        await page.goto(`${BASE}/demo/apresentacao`);
        await shot('apresentacao-entrada');
        await page.getByRole('button', { name: 'Começar apresentação' }).click();
        await page.getByRole('button', { name: 'Sair da apresentação' }).waitFor();
        for (const screen of SCREENS) {
          await page.goto(`${BASE}/demo/apresentacao?tela=${screen}`);
          await shot(`apresentacao-${screen}`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return count;
}

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
  const count = await capture();
  console.log(`capturas: ${count} capturas em ${OUT}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  stopServer(server);
}
