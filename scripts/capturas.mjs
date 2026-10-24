// Capturas de tela da demonstração no modo só demo (ADR-0043, ADR-0044): `pnpm capturas`.
// 1. build de produção com DEMO_ONLY=true (pule com --sem-build se o build já é desse modo);
// 2. sobe `next start` sem nenhuma credencial do app completo, como no e2e `demo-only`;
// 3. captura cada tela da demo e do modo apresentação em desktop (1440 px) e celular (390 px), temas claro e
//    escuro, em `capturas/` (fora do Git), como `<tela>_<tamanho>_<tema>.png`, depois de apagar tudo o que a
//    pasta tinha, menos `capturas/logo/`;
// 4. encerra o servidor e tudo o que ele abriu, inclusive se a captura falhar.
// Dados 100% fictícios (gerador em memória): nada de banco nem de dado real.
import { lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { DEMO_BODY_MODEL_STORAGE_KEY } from '../src/modules/twin/bodyModel.ts';
import { BROWSER_ARGS, ROOT, createDemoServer, settle, tourSeenState } from './demo-server.mjs';

const OUT = path.join(ROOT, 'capturas');
/** O que a limpeza da pasta preserva (arte da marca, fora das capturas). */
const KEEP = new Set(['logo']);
const skipBuild = process.argv.includes('--sem-build');
const {
  base: BASE,
  fail,
  run,
} = createDemoServer({
  label: 'capturas',
  port: Number(process.env.CAPTURAS_PORT ?? 3300),
  portVar: 'CAPTURAS_PORT',
});

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
/** Altura máxima de uma imagem, em pixels físicos (abaixo do limite de textura do Chrome headless). */
const MAX_SHOT_PX = 7680;
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
// Tema único escuro (ADR-0046).
const THEMES = [['escuro', 'dark']];

async function capture() {
  // Pasta limpa a cada rodada (nada de `_parte-N` ou vídeos de rodadas anteriores), menos `capturas/logo/`.
  mkdirSync(OUT, { recursive: true });
  // Pasta trocada por um link: a limpeza apagaria o destino, então para aqui.
  if (lstatSync(OUT).isSymbolicLink()) fail(`${OUT} é um link; use uma pasta comum`);
  for (const entry of readdirSync(OUT).filter((name) => !KEEP.has(name)))
    rmSync(path.join(OUT, entry), { recursive: true, force: true });
  // WebGL por software, como nos e2e do twin: sem ele o headless mostra o twin em 2D.
  const browser = await chromium.launch({ args: BROWSER_ARGS });
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
          storageState: tourSeenState(BASE),
        });
        const page = await context.newPage();
        const shot = async (name) => {
          await settle(page);
          // Janela da altura da página: barras fixas (lateral, navegação) ficam onde a pessoa as vê. Acima de
          // MAX_SHOT_PX pixels físicos o Chrome headless repete trechos da página na imagem (limite de textura):
          // a página sai em partes (`_parte-1`, `_parte-2`...), cada uma uma janela rolada até o seu trecho.
          const height = await page.evaluate(() => document.documentElement.scrollHeight);
          const chunk = Math.floor(MAX_SHOT_PX / size.deviceScaleFactor);
          const parts = Math.ceil(height / chunk);
          const file = (part) =>
            path.join(
              OUT,
              `${name}_${size.name}_${themeName}${parts > 1 ? `_parte-${part}` : ''}.png`,
            );
          await page.setViewportSize({
            width: size.viewport.width,
            height: Math.max(Math.min(height, chunk), size.viewport.height),
          });
          await settle(page);
          for (let part = 1; part <= parts; part += 1) {
            await page.evaluate((y) => window.scrollTo(0, y), (part - 1) * chunk);
            await page.waitForTimeout(200);
            await page.screenshot({ path: file(part) });
            count++;
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.setViewportSize(size.viewport);
        };
        for (const [name, url] of PAGES) {
          await page.goto(BASE + url);
          await shot(name);
        }
        // Twin com o outro modelo (troca guardada na chave da demo); a captura `twin` acima mostra o da pessoa
        // fictícia (ADR-0049).
        await page.evaluate(
          (key) => localStorage.setItem(key, 'feminine'),
          DEMO_BODY_MODEL_STORAGE_KEY,
        );
        await page.goto(`${BASE}/demo/twin`);
        await shot('twin-com-modelo');
        await page.evaluate((key) => localStorage.removeItem(key), DEMO_BODY_MODEL_STORAGE_KEY);
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

await run({
  skipBuild,
  task: async () => {
    const count = await capture();
    console.log(`capturas: ${count} capturas em ${OUT}`);
  },
});
