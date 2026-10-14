import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { generateDemoData } from '@/modules/demo/generator';
import {
  loadActivity,
  loadGoals,
  loadNutrition,
  loadReminders,
  loadTimeline,
} from '@/modules/health/screens';
import { createDemoSource } from '@/modules/health/source';
import { buildTimeline } from '@/modules/timeline';
import { findForbiddenTerms } from '../../../tests/content/forbidden-terms';
import { renderWithIntl } from '../../../tests/render';
import { ActivityView } from './activity/ActivityView';
import { GoalForm } from './goals/GoalForm';
import { GoalsView } from './goals/GoalsView';
import { MealForm } from './nutrition/MealForm';
import { NutritionView } from './nutrition/NutritionView';
import { RemindersSection } from './reminders/RemindersSection';
import { TimelineView } from './timeline/TimelineView';

const saveGoal = vi.hoisted(() => vi.fn());

vi.mock('@/app/(app)/alimentacao/actions', () => ({
  saveMealAction: vi.fn(),
  deleteMealAction: vi.fn(),
  addWaterAction: vi.fn(),
  removeWaterAction: vi.fn(),
  setCalorieEstimateAction: vi.fn(),
}));
vi.mock('@/app/(app)/atividade/actions', () => ({
  saveActivityAction: vi.fn(),
  deleteActivityAction: vi.fn(),
}));
vi.mock('@/app/(app)/metas/actions', () => ({
  saveGoalAction: saveGoal,
  archiveGoalAction: vi.fn(),
  deleteGoalAction: vi.fn(),
}));
vi.mock('@/app/(app)/habitos/reminder-actions', () => ({
  saveReminderAction: vi.fn(),
  saveReminderPrefsAction: vi.fn(),
  toggleReminderAction: vi.fn(),
  deleteReminderAction: vi.fn(),
}));

/**
 * Telas da Fase 4 com o catálogo pt-BR real (LEG-M03, LEG-M06, LEG-M07, LEG-M08): nenhum texto julga
 * corpo ou comida, nada prescreve dieta ou treino, a demo não mostra calorias.
 */
const TODAY = '2026-10-07';
const range: DateRange = { from: addDays(TODAY, -29), to: TODAY };
const source = createDemoSource(generateDemoData(TODAY, 'America/Sao_Paulo'));

function expectClean(text: string) {
  expect(text).not.toMatch(/\b(nutrition|activity|goals|reminders|timeline|insights)\.[a-z]/);
  expect(findForbiddenTerms(text).map((t) => t.id)).toEqual([]);
}

describe('telas da rotina no modo demo', () => {
  it('alimentação: sem calorias, sem rótulo de comida, com selo DEMO', async () => {
    const data = await loadNutrition(source, range, TODAY);
    const { container } = renderWithIntl(
      <NutritionView {...data} range={range} today={TODAY} mode="publicDemo" />,
    );
    const text = container.textContent ?? '';
    expectClean(text);
    expect(text).not.toMatch(/kcal|caloria/i);
    expect(screen.getAllByRole('button', { name: 'Origem do dado: Demo' }).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole('button', { name: /Origem do dado: (Informado|Estimado)/ }),
    ).toBeNull();
  });

  it('atividade: progressão só em relação ao próprio histórico, sem calorias gastas', async () => {
    const data = await loadActivity(source, range, TODAY);
    const { container } = renderWithIntl(
      <ActivityView {...data} range={range} today={TODAY} mode="publicDemo" />,
    );
    const text = container.textContent ?? '';
    expectClean(text);
    expect(text).not.toMatch(/kcal|caloria/i);
    expect(screen.getByRole('heading', { name: 'Progressão por exercício' })).toBeVisible();
    expect(text).toMatch(/em relação à sessão anterior/);
  });

  it('metas: barra com valor em texto; timeline e lembretes sem termo proibido', async () => {
    const goals = await loadGoals(source, TODAY);
    const g = renderWithIntl(<GoalsView {...goals} today={TODAY} mode="publicDemo" />);
    expectClean(g.container.textContent ?? '');
    for (const bar of screen.getAllByRole('progressbar')) {
      expect(bar.getAttribute('aria-valuetext')).toBeTruthy();
    }
    g.unmount();

    const timeline = await loadTimeline(source, range);
    const tl = renderWithIntl(
      <TimelineView
        days={buildTimeline({ ...timeline, range, today: TODAY, domain: null })}
        domain={null}
        basePath="/demo/timeline"
        range={range}
        today={TODAY}
        mode="publicDemo"
      />,
    );
    expectClean(tl.container.textContent ?? '');
    expect(screen.getByRole('link', { name: 'Tudo' })).toHaveAttribute('aria-current', 'page');
    tl.unmount();

    const reminders = await loadReminders(source);
    const r = renderWithIntl(<RemindersSection {...reminders} mode="publicDemo" />);
    expectClean(r.container.textContent ?? '');
  });
});

describe('formulários (LEG-M07)', () => {
  const meal = {
    eatenAt: '2026-10-07T12:00',
    category: 'lunch' as const,
    description: null,
    hunger: null,
    fullness: null,
    satisfaction: null,
    kcalEstimate: null,
    note: null,
  };

  it('refeição: campo de calorias só com a estimativa ligada', () => {
    const off = renderWithIntl(
      <MealForm values={meal} maxDateTime="2026-10-07T12:00" estimateEnabled={false} />,
    );
    expect(screen.queryByLabelText(/Estimativa de calorias/)).toBeNull();
    off.unmount();
    renderWithIntl(<MealForm values={meal} maxDateTime="2026-10-07T12:00" estimateEnabled />);
    expect(screen.getByLabelText(/Estimativa de calorias/)).toBeInTheDocument();
  });

  it('meta bloqueada: aviso acolhedor com apoio, sem número nem alvo alternativo (LEG-M04)', async () => {
    saveGoal.mockResolvedValue({ status: 'error', data: { reasons: ['target_below_safe_range'] } });
    const { container } = renderWithIntl(
      <GoalForm
        values={{ metric: 'weight_kg', targetValue: null, habitId: null, targetDay: null }}
        habits={[]}
        estimateEnabled={false}
        minDay="2026-10-08"
      />,
    );
    await userEvent.type(screen.getByLabelText('Alvo'), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta' }));
    await waitFor(() => expect(screen.getByTestId('guardrail-notice')).toBeVisible());
    const notice = screen.getByTestId('guardrail-notice');
    expect(notice).toHaveTextContent('188');
    expect(notice).toHaveTextContent('192');
    expect(notice.querySelector('section')?.textContent).not.toMatch(/\d/);
    expectClean(container.textContent ?? '');
    // A meta de calorias não é oferecida com a estimativa desligada.
    expect(
      screen.queryByRole('option', { name: 'Referência diária de calorias (estimativa)' }),
    ).toBeNull();
  });
});

describe('metas: calorias e peso (LEG-M06, LEG-M07, revisão M1/M2/B3)', () => {
  const base = {
    habitId: null,
    targetDay: null,
    status: 'active' as const,
    createdDay: '2026-09-01',
  };
  const kcal = {
    ...base,
    id: 'k',
    domain: 'nutrition' as const,
    metric: 'kcal_reference_day' as const,
    targetValue: 1800,
    startValue: null,
  };
  const weight = {
    ...base,
    id: 'w',
    domain: 'weight' as const,
    metric: 'weight_kg' as const,
    targetValue: 64,
    startValue: 60,
  };
  const progress = (goalId: string, current: number) => ({
    goalId,
    window: 'day' as const,
    current,
    target: 1,
    ratio: 1,
    reached: true,
    deadlinePassed: false,
    weightChangeKg: 4,
  });

  it('calorias: só total e referência em texto, sem barra, porcentagem nem "alcançado"', () => {
    const { container } = renderWithIntl(
      <GoalsView
        goals={[kcal]}
        habits={[]}
        progress={[progress('k', 1900)]}
        suspended={{}}
        estimateEnabled
        today={TODAY}
        mode="own"
      />,
    );
    expect(screen.queryByRole('progressbar')).toBeNull();
    const text = container.textContent ?? '';
    expect(text).toContain('Estimativa de hoje: 1.900 kcal · referência: 1.800 kcal');
    expect(text).not.toMatch(/Alvo alcançado|Progresso:/);
  });

  it('peso: sem "Alvo alcançado"; meta que hoje seria bloqueada mostra só o aviso', () => {
    const ok = renderWithIntl(
      <GoalsView
        goals={[weight]}
        habits={[]}
        progress={[progress('w', 64)]}
        suspended={{}}
        estimateEnabled={false}
        today={TODAY}
        mode="own"
      />,
    );
    expect(ok.container.textContent).not.toContain('Alvo alcançado');
    ok.unmount();
    renderWithIntl(
      <GoalsView
        goals={[weight]}
        habits={[]}
        progress={[progress('w', 64)]}
        suspended={{ w: ['target_below_safe_range'] }}
        estimateEnabled={false}
        today={TODAY}
        mode="own"
      />,
    );
    const notice = screen.getAllByTestId('guardrail-notice')[0];
    expect(notice).toHaveTextContent('188');
    expect(screen.queryByText(/Peso mais recente/)).toBeNull();
  });
});
