import { screen } from '@testing-library/react';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { BodyView } from '@/components/modules/body/BodyView';
import { GoalsView } from '@/components/modules/goals/GoalsView';
import { NutritionView } from '@/components/modules/nutrition/NutritionView';
import { TimelineView } from '@/components/modules/timeline/TimelineView';
import { TwinBodyView } from '@/components/twin/TwinViews';
import { addDays } from '@/lib/dates';
import { parsePrivacyMode } from '@/lib/privacy-mode';
import type { DateRange } from '@/lib/period';
import type { BodyRecord } from '@/modules/body';
import { generateDemoData } from '@/modules/demo/generator';
import type { GoalRecord } from '@/modules/goals';
import { buildDashboard } from '@/modules/health/dashboard';
import {
  maskBodyScreen,
  maskDashboard,
  maskGoalsScreen,
  maskNutritionScreen,
  maskTimeline,
} from '@/modules/health/mask';
import { loadGoals, loadNutrition, loadTimeline } from '@/modules/health/screens';
import { createDemoSource } from '@/modules/health/source';
import type { MealRecord } from '@/modules/nutrition';
import { buildTimeline } from '@/modules/timeline';
import { renderWithIntl } from '../../../tests/render';

vi.mock('@/app/(app)/corpo/actions', () => ({
  saveBodyAction: vi.fn(),
  deleteBodyAction: vi.fn(),
}));
vi.mock('@/app/(app)/alimentacao/actions', () => ({
  saveMealAction: vi.fn(),
  deleteMealAction: vi.fn(),
  addWaterAction: vi.fn(),
  removeWaterAction: vi.fn(),
  setCalorieEstimateAction: vi.fn(),
}));
vi.mock('@/app/(app)/metas/actions', () => ({
  saveGoalAction: vi.fn(),
  archiveGoalAction: vi.fn(),
  deleteGoalAction: vi.fn(),
}));
vi.mock('@/app/(app)/inicio/actions', () => ({
  toggleHabitCheckAction: vi.fn(),
  reviewScoreAction: vi.fn(),
}));

/**
 * Modo privacidade (ADR-0035, LEG-M06): o servidor tira os valores do corpo e as calorias dos dados
 * (`src/modules/health/mask.ts`) e as telas mostram "oculto". Nenhum número com kg, cm ou kcal no texto e
 * nenhum valor original nos dados que iriam ao navegador. Dados sintéticos (CLAUDE.md regra 6).
 */
const TODAY = '2026-10-07';
const range: DateRange = { from: addDays(TODAY, -29), to: TODAY };
const source = createDemoSource(generateDemoData(TODAY, 'America/Sao_Paulo'));
const UNIT_VALUE = /\d+(,\d+)?\s?(kg|cm|kcal)\b/;

const body: BodyRecord[] = [
  {
    id: 'b1',
    measuredAt: `${addDays(TODAY, -10)}T10:00:00.000Z`,
    day: addDays(TODAY, -10),
    weightKg: 81.3,
    heightCm: 177.5,
    waistCm: 93.7,
    hipCm: 101.9,
    armCm: 33.1,
    thighCm: 57.3,
    chestCm: 99.9,
    bodyFatPct: 23.4,
  },
  {
    id: 'b2',
    measuredAt: `${addDays(TODAY, -2)}T10:00:00.000Z`,
    day: addDays(TODAY, -2),
    weightKg: 80.9,
    heightCm: null,
    waistCm: 92.8,
    hipCm: null,
    armCm: null,
    thighCm: null,
    chestCm: null,
    bodyFatPct: null,
  },
];
const ORIGINAL_NUMBERS = ['81.3', '177.5', '93.7', '101.9', '80.9', '92.8', '23.4', '640'];

function expectNoValues(text: string) {
  expect(text).not.toMatch(UNIT_VALUE);
  for (const n of ORIGINAL_NUMBERS) {
    expect(text).not.toContain(n);
    expect(text).not.toContain(n.replace('.', ','));
  }
}

describe('cookie do modo privacidade', () => {
  it('só "on" liga', () => {
    expect(parsePrivacyMode('on')).toBe(true);
    for (const v of [undefined, '', 'off', 'ON', 'true', '1'])
      expect(parsePrivacyMode(v)).toBe(false);
  });
});

describe('mascaradores do servidor', () => {
  it('corpo: sem nenhum valor, com dia e quantidade', () => {
    const masked = maskBodyScreen(body);
    expect(masked.latestHeightCm).toBeNull();
    expect(masked.records.map((r) => r.day)).toEqual(body.map((r) => r.day));
    expectNoValues(JSON.stringify(masked));
  });

  it('metas de peso e de calorias sem alvo, partida nem progresso; as outras ficam', async () => {
    const data = await loadGoals(source, TODAY);
    const weight: GoalRecord = {
      id: 'g-weight',
      domain: 'weight',
      metric: 'weight_kg',
      targetValue: 77.7,
      startValue: 81.3,
      habitId: null,
      targetDay: addDays(TODAY, 90),
      status: 'active',
      createdDay: addDays(TODAY, -20),
    };
    const progress = {
      goalId: weight.id,
      window: 'target' as const,
      current: 80.9,
      target: 77.7,
      ratio: 0.1,
      reached: false,
      deadlinePassed: false,
      weightChangeKg: -0.4,
    };
    const masked = maskGoalsScreen({
      ...data,
      goals: [...data.goals, weight],
      progress: [...data.progress, progress],
    });
    const goal = masked.goals.find((g) => g.id === weight.id)!;
    expect(goal).toMatchObject({ targetValue: 0, startValue: null });
    expect(masked.progress.find((p) => p.goalId === weight.id)).toMatchObject({
      current: null,
      target: 0,
      weightChangeKg: null,
    });
    const others = data.goals.filter((g) => g.metric !== 'weight_kg');
    for (const g of others) expect(masked.goals.find((m) => m.id === g.id)).toEqual(g);
    expect(JSON.stringify(masked)).not.toContain('77.7');
  });
});

describe('telas no modo privacidade', () => {
  it('corpo: blocos "oculto", sem gráficos, lista nem formulário de edição', () => {
    const { records, latestHeightCm } = maskBodyScreen(body);
    const { container } = renderWithIntl(
      <BodyView
        records={records}
        latestHeightCm={latestHeightCm}
        range={range}
        today={TODAY}
        mode="own"
        hidden
      />,
    );
    const text = container.textContent ?? '';
    expectNoValues(text);
    expect(screen.getAllByText('oculto')).toHaveLength(3);
    expect(screen.getAllByText('Valores ocultos').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Seus registros' })).toBeNull();
    expect(text).toContain('2 medições');
  });

  it('twin com dados próprios: forma de referência e "oculto"', () => {
    const { records } = maskBodyScreen(body);
    const { container } = renderWithIntl(
      <TwinBodyView
        records={records}
        latestHeightCm={null}
        range={range}
        today={TODAY}
        mode="own"
        hidden
      />,
    );
    const text = container.textContent ?? '';
    expectNoValues(text);
    expect(text).toContain('forma de referência');
  });

  it('dashboard: card do corpo "oculto", sem variação', async () => {
    const data = maskDashboard(await buildDashboard(source, range, TODAY));
    expect(data.cards.body).toMatchObject({ weightKg: null, changeKg: null, spark: [] });
    const { container } = renderWithIntl(<Dashboard data={data} mode="appDemo" hidden />);
    expect(container.textContent).not.toMatch(UNIT_VALUE);
    expect(screen.getByRole('link', { name: 'Peso' }).closest('article')).toHaveTextContent(
      'oculto',
    );
  });

  it('alimentação: sem calorias e sem edição que apagaria a estimativa', async () => {
    const data = await loadNutrition(source, range, TODAY);
    const meal: MealRecord = {
      id: 'm1',
      eatenAt: `${TODAY}T15:00:00.000Z`,
      day: TODAY,
      time: '12:00',
      category: 'lunch',
      description: null,
      hunger: null,
      fullness: null,
      satisfaction: null,
      kcalEstimate: 640,
      note: null,
    };
    const masked = maskNutritionScreen({ ...data, meals: [meal], estimateEnabled: true });
    expect(masked.meals[0]?.kcalEstimate).toBeNull();
    const { container } = renderWithIntl(
      <NutritionView {...masked} range={range} today={TODAY} mode="own" hidden />,
    );
    expectNoValues(container.textContent ?? '');
    expect(
      screen.getByText('Para editar este registro, desligue o modo privacidade.'),
    ).toBeTruthy();
  });

  it('timeline: medição sem peso, com "valores ocultos"', async () => {
    const data = await loadTimeline(source, range);
    const days = maskTimeline(
      buildTimeline({ ...data, body, range, today: TODAY, domain: 'body' }),
    );
    const { container } = renderWithIntl(
      <TimelineView
        days={days}
        domain="body"
        basePath="/timeline"
        range={range}
        today={TODAY}
        mode="own"
        hidden
      />,
    );
    const text = container.textContent ?? '';
    expectNoValues(text);
    expect(text).toContain('Valores ocultos');
  });

  it('metas: alvo e progresso de peso ocultos', async () => {
    const data = await loadGoals(source, TODAY);
    const masked = maskGoalsScreen(data);
    const { container } = renderWithIntl(<GoalsView {...masked} today={TODAY} mode="own" hidden />);
    expect(container.textContent).not.toMatch(UNIT_VALUE);
  });
});
