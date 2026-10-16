import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_TOUR_SEEN_STATE, STORAGE_STATE } from './fixtures';

/**
 * §41 (7d, ADR-0039): o dashboard fica interativo em menos de 2,5 s num celular intermediário em 4G. Roda só no
 * build de produção (projeto `perf`; na CI, job próprio), com cache frio, rede 4G lenta (RTT 150 ms, 1,6 Mbit/s
 * de descida e 750 kbit/s de subida, a referência do Lighthouse para celular) e CPU 4× mais lenta que a máquina de referência (calibrada a cada carga,
 * ver `cpuRate`).
 *
 * "Interativo" = um controle do cabeçalho responde: o teste toca no botão do modo privacidade (presente no app e no
 * demo, em qualquer largura) até o `aria-pressed` mudar (antes da hidratação o toque não faz nada) e mede o tempo
 * desde o início da navegação. Mediana de 5 cargas.
 */
const budget = JSON.parse(readFileSync('perf-budget.json', 'utf8')) as {
  dashboard: {
    maxInteractiveMs: number;
    cpu: { baseRate: number; referenceMs: number; minRate: number; maxRate: number };
  };
};
const RUNS = 5;

interface Load {
  tti: number;
  lcp: number;
  ttfb: number;
  htmlEnd: number;
  jsEnd: number;
  /** Multiplicador de CPU aplicado e o tempo do teste fixo da máquina antes da carga. */
  rate?: number;
  benchmark?: number;
}
const KBIT = 1000 / 8;

test.skip(
  !process.env.CI && process.env.E2E_PROD !== '1',
  'Só no build de produção: E2E_PROD=1 pnpm test:perf (o dev server não representa o app publicado).',
);
test.describe.configure({ mode: 'serial' });

/**
 * Mesmo trabalho fixo de JavaScript (ordenar números, montar textos, criar objetos), no navegador e sem
 * redução. Mediana de 3 rodadas, em ms.
 */
async function benchmarkMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const run = () => {
      const start = performance.now();
      let acc = 0;
      for (let round = 0; round < 400; round += 1) {
        const numbers = Array.from({ length: 5000 }, (_, i) => (i * 7919 + round) % 10007);
        numbers.sort((a, b) => a - b);
        let text = '';
        for (let i = 0; i < 2000; i += 1) text += String.fromCharCode(97 + ((i + round) % 26));
        const objects = numbers
          .slice(0, 2000)
          .map((n) => ({ n, s: text.slice(n % 100, (n % 100) + 5) }));
        acc += objects.reduce((sum, o) => sum + o.n + o.s.length, 0);
      }
      if (acc < 0) throw new Error('inalcançável');
      return performance.now() - start;
    };
    const times = [run(), run(), run()].sort((a, b) => a - b);
    return times[1] ?? 0;
  });
}

/**
 * CPU calibrada (como o Lighthouse): "4×" é 4× mais lento que a máquina de referência em que a meta foi medida
 * (`perf-budget.json`, ADR-0039), e não 4× sobre um runner compartilhado que já é mais lento e varia de uma carga
 * para outra. Mede a máquina antes de cada carga e ajusta o multiplicador, dentro de [minRate, maxRate].
 */
async function cpuRate(page: Page): Promise<{ rate: number; benchmark: number }> {
  const { baseRate, referenceMs, minRate, maxRate } = budget.dashboard.cpu;
  const benchmark = await benchmarkMs(page);
  const rate = Math.min(maxRate, Math.max(minRate, (baseRate * referenceMs) / benchmark));
  return { rate: Math.round(rate * 100) / 100, benchmark: Math.round(benchmark) };
}

async function throttle(page: Page, rate: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1600 * KBIT,
    uploadThroughput: 750 * KBIT,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

async function timeToInteractive(page: Page, path: string): Promise<Load> {
  await page.goto(path, { waitUntil: 'commit' });
  const toggle = page.getByRole('button', { name: 'Modo privacidade', exact: true });
  await expect(async () => {
    await toggle.click({ timeout: 1000 });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 150 });
  }).toPass({ timeout: 15_000, intervals: [50] });
  return page.evaluate(
    () =>
      new Promise<Load>((resolve) => {
        // O atraso emulado pelo CDP não vale para a requisição da navegação (o HTML chega sem os 150 ms): soma o
        // que faltou, para a medida não sair otimista.
        const nav = performance.getEntriesByType('navigation')[0] as
          PerformanceNavigationTiming | undefined;
        const missingLatency = Math.max(0, 150 - (nav?.responseStart ?? 150));
        const tti = performance.now() + missingLatency;
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const js = (
            performance.getEntriesByType('resource') as PerformanceResourceTiming[]
          ).filter((r) => r.initiatorType === 'script');
          resolve({
            tti,
            lcp: (entries[entries.length - 1]?.startTime ?? 0) + missingLatency,
            // Divisão do tempo, para saber se o gargalo é servidor, HTML ou JS.
            ttfb: Math.round(nav?.responseStart ?? 0),
            htmlEnd: Math.round(nav?.responseEnd ?? 0),
            jsEnd: Math.round(Math.max(0, ...js.map((r) => r.responseEnd))),
          });
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      }),
  );
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

for (const { name, path, storageState } of [
  {
    name: 'dashboard da pessoa (dados sintéticos de 90 dias)',
    path: '/inicio',
    storageState: STORAGE_STATE,
  },
  { name: 'dashboard do demo público', path: '/demo', storageState: DEMO_TOUR_SEEN_STATE },
] as const) {
  test(`${name}: interativo em até ${budget.dashboard.maxInteractiveMs} ms (4G, CPU 4×)`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);
    const results: Load[] = [];
    for (let i = 0; i < RUNS; i += 1) {
      // Contexto novo a cada carga: cache e conexões frios, como na primeira visita do dia.
      const context = await browser.newContext({
        storageState,
        viewport: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const cpu = await cpuRate(page);
      await throttle(page, cpu.rate);
      results.push({ ...(await timeToInteractive(page, path)), ...cpu });
      await context.close();
    }
    const tti = Math.round(median(results.map((r) => r.tti)));
    const lcp = Math.round(median(results.map((r) => r.lcp)));
    testInfo.annotations.push({
      type: 'perf',
      description: `${path}: interativo ${tti} ms, LCP ${lcp} ms`,
    });
    console.log(
      `[perf] ${path} cargas (primeiro byte / fim do HTML / fim do JS / interativo, ms): ` +
        results
          .map(
            (r) =>
              `${r.ttfb}/${r.htmlEnd}/${r.jsEnd}/${Math.round(r.tti)} (CPU ${r.rate}×, máquina ${r.benchmark} ms)`,
          )
          .join(', '),
    );
    console.log(
      `[perf] ${path}: interativo ${tti} ms (cargas: ${results.map((r) => Math.round(r.tti)).join(', ')}), LCP ${lcp} ms`,
    );
    expect(tti).toBeLessThanOrEqual(budget.dashboard.maxInteractiveMs);
  });
}
