import { readFileSync } from 'node:fs';
import type { ReactElement } from 'react';
import { ActivityForm } from '@/components/modules/activity/ActivityForm';
import { BodyForm } from '@/components/modules/body/BodyForm';
import { GoalForm } from '@/components/modules/goals/GoalForm';
import { HabitForm } from '@/components/modules/habits/HabitForm';
import { MealForm } from '@/components/modules/nutrition/MealForm';
import { SleepForm } from '@/components/modules/sleep/SleepForm';
import { findForbiddenTerms } from '../../../tests/content/forbidden-terms';
import { renderWithIntl } from '../../../tests/render';

vi.mock('@/app/(app)/corpo/actions', () => ({ saveBodyAction: vi.fn() }));
vi.mock('@/app/(app)/sono/actions', () => ({ saveSleepAction: vi.fn() }));
vi.mock('@/app/(app)/alimentacao/actions', () => ({ saveMealAction: vi.fn() }));
vi.mock('@/app/(app)/atividade/actions', () => ({ saveActivityAction: vi.fn() }));
vi.mock('@/app/(app)/habitos/actions', () => ({ saveHabitAction: vi.fn() }));
vi.mock('@/app/(app)/metas/actions', () => ({ saveGoalAction: vi.fn() }));

const MAX = '2026-10-09T23:59';

/** Os formulários de registro, com as opções que mostram todos os campos (detalhes abertos, hábito por vezes). */
const FORMS: Array<[string, ReactElement]> = [
  [
    'corpo',
    <BodyForm
      key="body"
      maxDateTime={MAX}
      values={{
        measuredAt: MAX,
        weightKg: null,
        heightCm: null,
        waistCm: null,
        hipCm: null,
        armCm: null,
        thighCm: null,
        chestCm: null,
        bodyFatPct: null,
      }}
    />,
  ],
  [
    'sono',
    <SleepForm
      key="sleep"
      maxDateTime={MAX}
      values={{ bedAt: MAX, wakeAt: MAX, quality: null, awakenings: null, note: null }}
    />,
  ],
  [
    'alimentação',
    <MealForm
      key="meal"
      maxDateTime={MAX}
      estimateEnabled
      values={{
        eatenAt: MAX,
        category: 'lunch',
        description: null,
        hunger: 3,
        fullness: null,
        satisfaction: null,
        kcalEstimate: null,
        note: null,
      }}
    />,
  ],
  [
    'atividade',
    <ActivityForm
      key="activity"
      maxDateTime={MAX}
      values={{
        startedAt: MAX,
        type: 'walking',
        durationMin: null,
        intensity: null,
        distanceKm: null,
        note: null,
        sets: [],
      }}
    />,
  ],
  [
    'hábitos',
    <HabitForm
      key="habit"
      values={{ name: '', frequency: 'times_per_week', weekdays: [], timesPerWeek: 3 }}
    />,
  ],
  [
    'metas',
    <GoalForm
      key="goal"
      habits={[{ id: 'h1', name: 'Alongar' }]}
      estimateEnabled
      minDay="2026-10-10"
      values={{ metric: 'habit_completion_pct', targetValue: null, habitId: null, targetDay: null }}
    />,
  ],
];

/** Texto dos elementos que descrevem um controle. */
function description(el: Element): { ids: string[]; text: string } {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
  return { ids, text: ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ') };
}

describe('campo explicado em todo formulário de registro (9d)', () => {
  it.each(FORMS)('%s: cada campo diz o que é, ligado por aria-describedby', (_, form) => {
    const { container } = renderWithIntl(form);
    // Campos de texto, data e número (fora das linhas de séries, que têm a explicação do grupo), áreas de texto,
    // seletores no estilo do app (botão do `ChoiceMenu`) e escalas (fieldset de rádios).
    const controls = [
      ...container.querySelectorAll(
        'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([name^="set"]), textarea',
      ),
      ...container.querySelectorAll('button[aria-controls]'),
      ...[...container.querySelectorAll('fieldset')].filter((f) =>
        f.querySelector('input[type="radio"]:not([role])'),
      ),
    ];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const { ids, text } = description(control);
      const name = control.getAttribute('name') ?? control.textContent;
      expect(
        ids.some((id) => id.endsWith('-what')),
        `campo sem "o que é": ${name}`,
      ).toBe(true);
      expect(findForbiddenTerms(text).map((t) => t.id)).toEqual([]);
    }
  });

  it.each(FORMS)(
    '%s: campo com unidade traz o sufixo e a unidade por extenso no nome',
    (_, form) => {
      const { container } = renderWithIntl(form);
      for (const suffix of container.querySelectorAll('input + span[aria-hidden="true"]')) {
        const input = suffix.previousElementSibling as HTMLInputElement;
        const label = container.querySelector(`label[for="${input.id}"]`);
        expect(label?.querySelector('.sr-only')?.textContent).toMatch(/^, em /);
      }
    },
  );

  it('todo texto de ajuda tem "o que é"; exemplos sem número de referência de calorias (LEG-M07)', () => {
    type Help = Record<string, { what?: string; how?: string; example?: string }>;
    const catalog = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8')) as Record<
      string,
      { help?: Help }
    >;
    const modules = ['body', 'sleep', 'nutrition', 'activity', 'habits', 'goals'];
    for (const mod of modules) {
      const help = catalog[mod]?.help;
      expect(help, `${mod}.help`).toBeDefined();
      for (const [field, entry] of Object.entries(help ?? {})) {
        expect(entry.what, `${mod}.help.${field}.what`).toBeTruthy();
      }
    }
    expect(catalog.nutrition?.help?.kcal?.example).toBeUndefined();
    // Toda medida do corpo explica como medir e traz exemplo (a unidade vem de MEASURE_UNITS).
    for (const [field, entry] of Object.entries(catalog.body?.help ?? {})) {
      if (field === 'measuredAt') continue;
      expect(entry.how, `body.help.${field}.how`).toBeTruthy();
      expect(entry.example, `body.help.${field}.example`).toMatch(/^\d+(,\d)?$/);
    }
  });
});
