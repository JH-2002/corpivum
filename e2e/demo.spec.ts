import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DEMO_TOUR_SEEN_STATE, foreignRowsSince } from './fixtures';
import { DEMO_ROUTES, VIEWPORTS } from './routes';
import { choosePeriod } from './period';
import { settled } from './settle';

/**
 * Demo público sem login (LEG-X02, §40, ADR-0021): dados fictícios com selo DEMO, sem formulários, sem
 * sessão e sem gravar nada no banco. Acessível (LEG-X01) e responsivo (320–1920px).
 */
test.use({ storageState: DEMO_TOUR_SEEN_STATE });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('o demo não cria sessão nem grava nada no banco', async ({ page, context }) => {
  const start = new Date(Date.now() - 1000);
  for (const route of DEMO_ROUTES) {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible();
  }
  // Troca de período: só a preferência de interface, em cookie de sessão.
  await page.goto('/demo');
  await choosePeriod(page, '7 dias');
  await expect(page.getByText(/^\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
  await expect
    .poll(async () => (await context.cookies()).map((c) => c.name))
    .toContain('__Host-hm_period');

  const cookies = await context.cookies();
  expect(cookies.map((c) => c.name).sort()).toEqual(['__Host-hm_period']);
  const period = cookies[0];
  expect(period?.expires).toBe(-1); // cookie de sessão
  expect(period?.httpOnly).toBe(true);
  const written = await foreignRowsSince(start);
  expect(Object.entries(written).filter(([, n]) => n !== 0)).toEqual([]);
});

test('dados com selo DEMO, formulários só de exemplo e com caminho para criar conta', async ({
  page,
}) => {
  await page.goto('/demo');
  await expect(page.getByRole('banner')).toContainText('DEMO');
  await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeVisible();
  // Todo selo exibido é DEMO (discreto: só o ícone, com o nome acessível).
  const badges = page.getByRole('button', { name: /^Origem do dado:/ });
  expect(await badges.count()).toBeGreaterThan(5);
  for (const name of await badges.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label')),
  ))
    expect(name).toBe('Origem do dado: Demo');
  await expect(page.getByRole('button', { name: 'Pedir revisão' })).toHaveCount(0);

  // Formulário de exemplo (9b): preenchido, com todos os campos e o envio desativados.
  await page.goto('/demo/sono');
  const example = page.locator('#novo');
  await expect(example.getByText(/na demonstração nada é salvo/)).toBeVisible();
  // Um aviso só (9d0): nada é salvo e, no demo público, o caminho para criar conta.
  await expect(example.getByText(/na demonstração nada é salvo/)).toHaveCount(1);
  await expect(example.getByText(/crie uma conta/)).toBeVisible();
  expect(await example.locator('input, select, textarea, button').count()).toBeGreaterThan(0);
  for (const control of await example.locator('input, select, textarea, button').all()) {
    await expect(control).toBeDisabled();
  }

  await page.goto('/demo');
  await page.getByRole('link', { name: 'Começar com meus próprios dados' }).click();
  await expect(page).toHaveURL(/\/cadastro$/);
});

test('"Como é calculado" explica componentes e pesos; na demo o Índice é completo (ADR-0050)', async ({
  page,
}) => {
  await page.goto('/demo');
  await expect(page.getByText(/^Dados parciais/)).toHaveCount(0);
  await page.getByText('Como é calculado', { exact: true }).click();
  const table = page.getByRole('table', { name: /Componentes do Índice de Bem-Estar/ });
  await expect(table).toBeVisible();
  await expect(table.getByText('Regularidade do sono')).toBeVisible();
  await expect(table.getByText('Atividade física', { exact: true })).toBeVisible();
  await expect(table.getByText(/^Fora:/)).toHaveCount(0);
  // No topo: rolada até o "Como é calculado", a página deixa um selo sob o cabeçalho fixo, e o axe conta o
  // pedaço coberto como alvo pequeno (o selo tem 24 px; a cobertura é do cabeçalho, não do selo).
  await page.evaluate(() => window.scrollTo(0, 0));
  const results = await new AxeBuilder({ page: await settled(page) }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

// axe do demo nos dois temas: a11y.spec.ts (inventário de todas as páginas, 7d).

test('gráfico de peso com rótulos inteiros em pt-BR e eixo com faixa mínima (revisão da 9a)', async ({
  page,
}) => {
  await page.goto('/demo/corpo');
  const chart = page.getByRole('region', { name: 'Peso no período' });
  // O desenho (recharts) chega num chunk próprio, depois da hidratação.
  await chart.scrollIntoViewIfNeeded();
  const ticks = chart.locator('text.recharts-cartesian-axis-tick-value[orientation="left"]');
  await expect(ticks.first()).toBeVisible({ timeout: 15_000 });
  const box = await chart.boundingBox();
  const labels = await ticks.allTextContents();
  // Números em pt-BR (vírgula decimal), nunca cortados à esquerda do cartão.
  for (const label of labels) expect(label).toMatch(/^\d+(,\d+)?$/);
  for (const tick of await ticks.all()) {
    expect((await tick.boundingBox())!.x).toBeGreaterThanOrEqual(box!.x);
  }
  const values = labels.map((l) => Number(l.replace(',', '.')));
  expect(Math.max(...values) - Math.min(...values)).toBeGreaterThanOrEqual(4);
});

test('"Últimos 7 dias" dos hábitos em uma linha de 7 colunas a 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/demo/habitos');
  const grid = page.getByText('Últimos 7 dias').first().locator('xpath=following-sibling::ul[1]');
  const cells = grid.locator(':scope > li');
  await expect(cells).toHaveCount(7);
  const tops = await cells.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(new Set(tops).size).toBe(1);
  const sizes = await cells.evaluateAll((els) =>
    els.map((e) => e.lastElementChild!.getBoundingClientRect().width),
  );
  for (const w of sizes) expect(w).toBeGreaterThanOrEqual(24);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe('demo responsivo, sem rolagem horizontal', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const path of ['/demo', '/demo/sono', '/demo/corpo']) {
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
    });
  }
});

test('fora do modo só demo, o aviso da demonstração não existe (ADR-0043)', async ({ request }) => {
  // O aviso descreve a demo sem cadastro nem banco e outro responsável: no app completo, seria falso.
  expect((await request.get('/demo/sobre')).status()).toBe(404);
});

test.describe('demo: navegação inferior igual à do app e "Registrar" em modo exemplo (9b)', () => {
  for (const width of [320, 390]) {
    test(`${width}px: 5 itens, sem rolagem, e "Mais" com os outros módulos`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/demo');
      const bottom = page.getByRole('navigation', { name: 'Navegação inferior' });
      const items = bottom.getByRole('listitem');
      await expect(items).toHaveCount(5);
      await expect(bottom.getByRole('button', { name: 'Registrar' })).toBeVisible();
      const barOverflow = await bottom
        .getByRole('list')
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(barOverflow).toBeLessThanOrEqual(0);
      const pageOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(pageOverflow).toBeLessThanOrEqual(0);

      await bottom.getByRole('link', { name: 'Mais' }).click();
      await expect(page).toHaveURL(/\/demo\/mais$/);
      await expect(bottom.getByRole('link', { name: 'Mais' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await page.getByRole('main').getByRole('link', { name: 'Sono' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Sono' })).toBeVisible();
      await expect(page).toHaveURL(/\/demo\/sono$/);
    });
  }

  test('"Registrar" abre o diálogo e leva ao exemplo, sem nenhum envio ao servidor', async ({
    page,
  }) => {
    const sent: string[] = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET' && req.method() !== 'HEAD')
        sent.push(`${req.method()} ${req.url()}`);
    });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/demo');
      const trigger =
        width < 768
          ? page.getByRole('navigation', { name: 'Navegação inferior' }).getByRole('button', {
              name: 'Registrar',
            })
          : page.getByRole('banner').getByRole('button', { name: 'Registrar' });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'O que você quer registrar?' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/nada é salvo/)).toBeVisible();
      await expect(dialog.getByRole('link', { name: 'Meta' })).toBeVisible();
      await dialog.getByRole('link', { name: 'Peso e medidas' }).click();
      await expect(page).toHaveURL(/\/demo\/corpo#novo$/);
      await expect(page.locator('#novo [data-example-focus]')).toBeFocused();
      await expect(page.locator('#novo').getByRole('button', { name: /Salvar/ })).toBeDisabled();
    }
    // Nenhum POST (formulário, server action) saiu da demo (regras 4 e 6).
    expect(sent).toEqual([]);
  });
});

test('campo explicado (9d): unidade, exemplo e "Como medir" pelo teclado, sem violações de axe', async ({
  page,
}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/demo/corpo');
    const form = page.locator('#novo');
    const waist = form.getByLabel('Cintura, em centímetros');
    await expect(waist).toBeVisible();
    await expect(waist).toHaveAccessibleDescription(
      /Circunferência da cintura\..*Formato: 12,3 cm/,
    );
    // Sufixo visual da unidade dentro do campo.
    await expect(waist.locator('xpath=following-sibling::span[1]')).toHaveText('cm');
    // "Como medir" fecha por padrão e abre com Enter, mesmo com os campos do exemplo desativados.
    const how = form.locator('details').filter({ hasText: 'parte mais estreita' });
    await expect(how).not.toHaveAttribute('open');
    // Formulário leve (9d1): fechado, só a linha curta aparece; o exemplo fica dentro do "Como medir".
    await expect(how.getByText('Formato: 12,3 cm')).toBeHidden();
    await how.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(how).toHaveAttribute('open');
    await expect(how.getByText(/parte mais estreita entre as costelas e o quadril/)).toBeVisible();
    await expect(how.getByText('Formato: 12,3 cm')).toBeVisible();
    const results = await new AxeBuilder({ page: await settled(page) })
      .include('#novo')
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations).toEqual([]);
    await page.keyboard.press('Enter');
    await expect(how).not.toHaveAttribute('open');
  }
});

test.describe('cartões com inclinação (ADR-0048)', () => {
  test('com mouse inclinam e voltam; "Reduzir animações" desliga e persiste', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/demo');
    // O twin do início chega depois da carga e muda o layout (ADR-0049): espera ele (3 indicadores + o painel
    // da região) antes de medir a posição de um indicador.
    await expect.poll(() => page.locator('[data-tilt]').count()).toBeGreaterThanOrEqual(4);
    const card = page.locator('article[data-tilt]').first();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    if (!box) throw new Error('cartão sem caixa');
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
    await expect
      .poll(() => card.evaluate((el) => (el as HTMLElement).style.transform))
      .toMatch(/rotateX\(.+deg\) rotateY\(.+deg\)/);
    await page.mouse.move(5, 5);
    await expect.poll(() => card.evaluate((el) => (el as HTMLElement).style.transform)).toBe('');

    await page.getByRole('button', { name: 'Ajuda' }).click();
    await page.getByRole('button', { name: /Reduzir animações/ }).click();
    await expect(page.locator('[data-tilt]')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeVisible();
    await expect(page.locator('[data-tilt]')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  });

  test('sem efeito em tela de toque nem com prefers-reduced-motion', async ({ browser }) => {
    for (const options of [
      { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } },
      { reducedMotion: 'reduce' as const, viewport: { width: 1440, height: 900 } },
    ]) {
      const context = await browser.newContext({ ...options, storageState: DEMO_TOUR_SEEN_STATE });
      const page = await context.newPage();
      await page.goto('/demo');
      await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeVisible();
      await expect(page.locator('[data-tilt]')).toHaveCount(0);
      await context.close();
    }
  });
});

test.describe('movimento e interatividade (9f, ADR-0055)', () => {
  test('desktop com mouse: contagem ao rolar, gráfico se revela, brilho no hover, ímã no Registrar, "Ver mais" em sequência; axe', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/demo');
    await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeVisible();

    // Contagem: o valor final está sempre no DOM (o leitor de tela lê ele); o contador é aria-hidden.
    const count = page.locator('[data-count-up]').first();
    await expect(count.locator('span').first()).toHaveText(/^\d+$/);
    await expect(count.locator('span').nth(1)).toHaveAttribute('aria-hidden', 'true');
    await count.scrollIntoViewIfNeeded();
    await expect(count.locator('span').nth(1)).toBeEmpty({ timeout: 3000 });

    // Gráfico do início: revela ao entrar e termina sem recorte.
    const plot = page.locator('[data-tour="chart"] [data-reveal="draw"]');
    await plot.scrollIntoViewIfNeeded();
    await expect(plot).not.toHaveAttribute('data-reveal-state', /.*/, { timeout: 5000 });

    // Brilho e borda azul ao passar o mouse num cartão clicável.
    const card = page.locator('article[data-tilt]').first();
    await card.hover();
    await expect.poll(() => card.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');

    // Ímã do Registrar: o desenho se move, o contêiner fica.
    const magnetic = page.locator('[data-magnetic]');
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await magnetic.boundingBox();
    if (!box) throw new Error('Registrar sem caixa');
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9);
    await expect
      .poll(() => magnetic.evaluate((el) => (el.firstElementChild as HTMLElement).style.transform))
      .toMatch(/translate\(/);
    const after = await magnetic.boundingBox();
    expect(after?.x).toBe(box.x);

    // "Ver mais" na Timeline: só as semanas novas entram, e o foco vai para a primeira delas.
    await page.goto('/demo/timeline');
    const more = page.getByRole('button', { name: 'Ver mais semanas' });
    await expect(page.locator('[data-enter]')).toHaveCount(0);
    await more.click();
    await expect(page.locator('[data-enter]').first()).toBeVisible();
    await expect(page.locator('[data-enter] h3').first()).toBeFocused();
    const results = await new AxeBuilder({ page: await settled(page) })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('"Reduzir animações": sem contagem, sem gráfico escondido, sem ímã', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem('hm.motion', 'reduced'));
    await page.goto('/demo');
    await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await expect(page.locator('[data-reveal]').first()).toBeAttached();
    await expect(page.locator('[data-reveal-state]')).toHaveCount(0);
    for (const counter of await page.locator('[data-count-up] > span:nth-child(2)').all()) {
      await expect(counter).toBeEmpty();
    }
    await expect(page.locator('[data-magnetic]')).toHaveCount(0);
  });

  test('tela de toque: sem inclinação, sem ímã e sem brilho de hover', async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
      storageState: DEMO_TOUR_SEEN_STATE,
    });
    const page = await context.newPage();
    await page.goto('/demo');
    await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeVisible();
    await expect(page.locator('[data-tilt]')).toHaveCount(0);
    await expect(page.locator('[data-magnetic]')).toHaveCount(0);
    expect(
      await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches),
    ).toBe(false);
    await context.close();
  });
});
