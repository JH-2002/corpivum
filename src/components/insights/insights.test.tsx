import { screen, within } from '@testing-library/react';
import { addDays, eachDay, previousRange } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { generateDemoData } from '@/modules/demo/generator';
import { buildDashboard } from '@/modules/health/dashboard';
import { createDemoSource } from '@/modules/health/source';
import {
  bodyInsights,
  habitsInsights,
  sleepInsights,
  type ModuleInsights,
} from '@/modules/insights';
import {
  bodyEntry,
  checksOn,
  day,
  habit,
  PREV_WEEK,
  sleepWeek,
  TODAY,
  WEEK,
} from '@/modules/insights/fixtures';
import { findForbiddenTerms } from '../../../tests/content/forbidden-terms';
import { renderWithIntl } from '../../../tests/render';
import { highlightColumns, PeriodInsights } from './PeriodInsights';

/**
 * Texto final da camada explicativa (ADR-0025), montado com o catálogo pt-BR real. Fecha a lacuna do
 * ADR-0004 (strings fora do catálogo não eram varridas): toda frase gerada passa pelo glossário LEG-M03.
 */

function textOf(insights: ModuleInsights, demo = false): string {
  const { container, unmount } = renderWithIntl(<PeriodInsights insights={insights} demo={demo} />);
  const text = container.textContent ?? '';
  unmount();
  return text;
}

function expectClean(text: string) {
  expect(text).not.toMatch(/insights\.|charts\.guide\./);
  expect(findForbiddenTerms(text).map((t) => t.id)).toEqual([]);
}

const FIXTURES: Record<string, ModuleInsights[]> = {
  sleep: [
    sleepInsights({
      records: sleepWeek(WEEK, [420, 420, 450, 430, 400, 340, 340]),
      previous: sleepWeek(PREV_WEEK, Array(7).fill(420)),
      range: WEEK,
      today: TODAY,
    }),
    sleepInsights({ records: sleepWeek(WEEK, [400]), previous: [], range: WEEK, today: TODAY }),
    sleepInsights({ records: [], previous: [], range: WEEK, today: TODAY }),
  ],
  habits: [
    habitsInsights({
      habits: [habit()],
      checks: checksOn('h1', [day(0), day(1), day(2), day(3), day(5)]),
      previousChecks: checksOn('h1', [PREV_WEEK.from]),
      range: WEEK,
      previousRange: PREV_WEEK,
      today: TODAY,
      streaksEnabled: true,
    }),
    habitsInsights({
      habits: [habit({ createdDay: day(6) })],
      checks: [],
      previousChecks: [],
      range: WEEK,
      previousRange: PREV_WEEK,
      today: TODAY,
      streaksEnabled: true,
    }),
    habitsInsights({
      habits: [],
      checks: [],
      previousChecks: [],
      range: WEEK,
      previousRange: PREV_WEEK,
      today: TODAY,
      streaksEnabled: true,
    }),
  ],
  body: [
    bodyInsights({
      records: [
        bodyEntry(day(0), { weightKg: 70, waistCm: 80 }),
        bodyEntry(day(6), { weightKg: 69.2, waistCm: 79 }),
      ],
      range: WEEK,
      today: TODAY,
    }),
    bodyInsights({ records: [bodyEntry(day(0), { weightKg: 70 })], range: WEEK, today: TODAY }),
    bodyInsights({ records: [], range: WEEK, today: TODAY }),
  ],
};

describe('texto do resumo (ADR-0025)', () => {
  it('sono: o exemplo do pedido, em linguagem simples', () => {
    renderWithIntl(<PeriodInsights insights={FIXTURES.sleep![0]!} demo={false} />);
    expect(
      screen.getByText(
        'Nos últimos 7 dias, você dormiu em média 6 h 40 min por noite, considerando 7 noites registradas.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('São 20 min a menos que na semana anterior.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Suas noites mais curtas foram na terça e na quarta; a mais longa, no sábado.',
      ),
    ).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Resumo do período' });
    expect(
      within(summary).getByRole('button', { name: 'Origem do dado: Estimado' }),
    ).toBeInTheDocument();
    // Destaques com selo próprio.
    expect(screen.getByRole('heading', { name: 'Destaques do período' })).toBeInTheDocument();
    expect(screen.getByText('Noite mais longa')).toBeInTheDocument();
  });

  it.each(Object.entries(FIXTURES))(
    '%s: completo, parcial e vazio, sem chave faltando nem termo proibido',
    (_module, cases) => {
      for (const insights of cases) expectClean(textOf(insights));
    },
  );

  it('estado parcial avisa que considera só os dias com registro; vazio não mostra destaques', () => {
    const partial = textOf(FIXTURES.sleep![1]!);
    expect(partial).toContain('Poucos registros: o resumo considera só os dias que têm registro.');
    const empty = textOf(FIXTURES.sleep![2]!);
    expect(empty).toContain('Ainda não há noites registradas neste período.');
    expect(empty).not.toContain('Destaques do período');
  });

  it('período escolhido (não termina hoje) e longo: data por extenso e período anterior de N dias', () => {
    const range: DateRange = { from: '2026-09-01', to: '2026-09-30' };
    const text = textOf(
      sleepInsights({
        records: sleepWeek(
          range,
          Array(30)
            .fill(400)
            .map((v, i) => v + (i % 3) * 30),
        ),
        previous: sleepWeek(previousRange(range), Array(31).fill(400)),
        range,
        today: TODAY,
      }),
    );
    expect(text).toContain('No período escolhido, você dormiu em média');
    expect(text).toMatch(/nos 30 dias anteriores/);
    expect(text).toMatch(/em \d{1,2} de setembro/);
  });
});

describe('modo demo (LEG-X02)', () => {
  const data = generateDemoData(TODAY, 'America/Sao_Paulo');
  const source = createDemoSource(data);
  const range: DateRange = { from: addDays(TODAY, -29), to: TODAY };
  const prev = previousRange(range);

  it('todos os resumos ficam completos, com selo DEMO e sem termo proibido', async () => {
    const [sleep, sleepPrev, habits, checks, checksPrev, body] = await Promise.all([
      source.sleep(range),
      source.sleep(prev),
      source.habits(),
      source.checks(range),
      source.checks(prev),
      source.body(range),
    ]);
    const dashboard = (await buildDashboard(source, range, TODAY)).insights;
    const all = [
      dashboard,
      sleepInsights({ records: sleep, previous: sleepPrev, range, today: TODAY }),
      habitsInsights({
        habits,
        checks,
        previousChecks: checksPrev,
        range,
        previousRange: prev,
        today: TODAY,
        streaksEnabled: true,
      }),
      bodyInsights({ records: body, range, today: TODAY }),
    ];
    for (const insights of all) {
      expect(insights.state, insights.module).toBe('ok');
      expect(insights.sentences.length).toBeGreaterThanOrEqual(2);
      const { container, unmount } = renderWithIntl(<PeriodInsights insights={insights} demo />);
      expectClean(container.textContent ?? '');
      const badges = [...container.querySelectorAll('button')].map((b) =>
        b.getAttribute('aria-label'),
      );
      expect(new Set(badges)).toEqual(new Set(['Origem do dado: Demo']));
      unmount();
    }
    expect(eachDay(range)).toHaveLength(30);
  });
});

describe('grade dos destaques (9d0)', () => {
  it('nenhum cartão solto: as colunas acompanham a quantidade de destaques', () => {
    expect(highlightColumns(1)).toBe('');
    expect(highlightColumns(2)).toBe('sm:grid-cols-2');
    expect(highlightColumns(3)).toBe('sm:grid-cols-3');
    expect(highlightColumns(4)).toBe('sm:grid-cols-2 xl:grid-cols-4');
  });
});
