import { addDays, eachDay, fromLocalDateTime, weekday } from '@/lib/dates';
import { round } from '@/lib/stats';
import type { ActivityRecord, ActivityType } from '@/modules/activity';
import type { BodyRecord } from '@/modules/body';
import type { GoalRecord } from '@/modules/goals';
import type { HabitCheckRecord, HabitRecord } from '@/modules/habits';
import type { ReminderRecord } from '@/modules/notifications';
import type { MealCategory, MealRecord, WaterRecord } from '@/modules/nutrition';
import type { SleepRecord } from '@/modules/sleep';

/**
 * Dados de demonstração 100% FICTÍCIOS (LEG-X02, CLAUDE.md regra 6, §40). Gerador determinístico (PRNG
 * com semente fixa), com datas relativas a `today`: 90 dias coerentes. Não lê nem grava nada: tudo em memória.
 * Nenhum nome, e-mail ou texto de pessoa real; as frases são escritas para a demo.
 */
export const DEMO_DAYS = 90;
export const DEMO_SEED = 360;

export interface DemoDataset {
  today: string;
  sleep: SleepRecord[];
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  body: BodyRecord[];
  meals: MealRecord[];
  water: WaterRecord[];
  activities: ActivityRecord[];
  goals: GoalRecord[];
  reminders: ReminderRecord[];
}

/** mulberry32: PRNG pequeno e determinístico. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hhmm(totalMinutes: number): string {
  const m = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const clampInt = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(v)));

const SLEEP_NOTES = [
  'Dormi depois de ler um pouco.',
  'Acordei com barulho na rua.',
  'Noite tranquila.',
  'Fui dormir mais tarde: fiquei vendo uma série.',
];

/**
 * Sorteios que o humor e o diário (removidos, ADR-0027) consumiam por dia, na mesma ordem. Consumir os
 * mesmos sorteios mantém a sequência dos demais dados do demo (sono, hábitos, corpo) igual à de antes.
 * Humor: presença, humor, energia, estresse, horário, duas emoções e nota.
 */
function skipRemovedMood(rand: () => number): void {
  if (rand() >= 0.85) return;
  for (let k = 0; k < 6; k++) rand();
  if (rand() < 0.1) rand();
}

/** Diário: presença (~3 por semana) e sorteio do texto. */
function skipRemovedJournal(rand: () => number): void {
  if (rand() < 0.4) rand();
}

/** Gera o conjunto de demonstração terminando em `today` (inclusive). */
export function generateDemoData(today: string, timeZone: string): DemoDataset {
  const rand = prng(DEMO_SEED);
  const start = addDays(today, -(DEMO_DAYS - 1));
  const days = eachDay({ from: start, to: today });

  const sleep: SleepRecord[] = [];
  const checks: HabitCheckRecord[] = [];
  const body: BodyRecord[] = [];

  const habits: HabitRecord[] = [
    {
      id: 'demo-habit-1',
      name: 'Caminhar 20 minutos',
      frequency: 'daily',
      weekdays: [],
      timesPerWeek: null,
      archived: false,
      createdDay: start,
    },
    {
      id: 'demo-habit-2',
      name: 'Ler antes de dormir',
      frequency: 'weekdays',
      weekdays: [1, 2, 3, 4, 5],
      timesPerWeek: null,
      archived: false,
      createdDay: start,
    },
    {
      id: 'demo-habit-3',
      name: 'Alongamento',
      frequency: 'times_per_week',
      weekdays: [],
      timesPerWeek: 3,
      archived: false,
      createdDay: start,
    },
  ];

  let weight = 74.2;
  days.forEach((day, i) => {
    const wd = weekday(day);
    const weekend = wd === 0 || wd === 6;
    // Leve melhora da rotina ao longo dos 90 dias (curva suave, sem mensagem de causa).
    const progress = i / DEMO_DAYS;

    // Sono: registrado em ~90% dos dias, contado para o dia do despertar.
    let lastNightHours: number | null = null;
    if (rand() < 0.9) {
      const bedMin = 23 * 60 + 10 + (weekend ? 50 : 0) + (rand() - 0.5) * (70 - 30 * progress);
      const durationMin = 7 * 60 + (weekend ? 40 : 0) + (rand() - 0.5) * 100 + 20 * progress;
      const bedDay = bedMin >= 24 * 60 ? day : addDays(day, -1);
      const bedAt = fromLocalDateTime(`${bedDay}T${hhmm(bedMin)}`, timeZone);
      const wakeAt = new Date(bedAt.getTime() + durationMin * 60_000);
      lastNightHours = durationMin / 60;
      sleep.push({
        id: `demo-sleep-${i}`,
        bedAt: bedAt.toISOString(),
        wakeAt: wakeAt.toISOString(),
        day,
        bedTime: hhmm(bedMin),
        wakeTime: hhmm(bedMin + durationMin),
        quality: clampInt(3 + (lastNightHours - 7) + (rand() - 0.5) * 1.5, 1, 5),
        awakenings: clampInt(rand() * 3, 0, 3),
        note: rand() < 0.12 ? (SLEEP_NOTES[Math.floor(rand() * SLEEP_NOTES.length)] ?? null) : null,
      });
    }

    skipRemovedMood(rand);

    // Hábitos.
    if (rand() < 0.6 + 0.25 * progress) checks.push({ habitId: 'demo-habit-1', day });
    if (!weekend && rand() < 0.7) checks.push({ habitId: 'demo-habit-2', day });
    if ([1, 3, 5].includes(wd) && rand() < 0.75) checks.push({ habitId: 'demo-habit-3', day });

    skipRemovedJournal(rand);

    // Corpo: uma medição por semana; altura na primeira e na mais recente; circunferências de todas as regiões
    // a cada 2 semanas (9c: o twin do início mostra a evolução de cada região). Só as semanas "mensais" usam
    // `rand()` (como antes); as outras usam um ruído fixo por dia, para não mudar a sequência dos demais dados
    // (corpo 3D, ADR-0026). Variações pequenas e neutras, sem trajetória de "transformação" (LEG-M06).
    weight += (rand() - 0.55) * 0.25;
    if (wd === 1 || i === 0) {
      const monthly = i === 0 || i % 28 < 7;
      const girths = monthly || i % 14 < 7;
      const noise = (k: number) => (monthly ? rand() - 0.5 : fixedNoise(i, k));
      body.push({
        id: `demo-body-${i}`,
        measuredAt: fromLocalDateTime(`${day}T07:30`, timeZone).toISOString(),
        day,
        weightKg: round(weight, 1),
        heightCm: i === 0 ? 170 : null,
        waistCm: girths ? round(86 - progress * 2 + noise(1), 1) : null,
        hipCm: girths ? round(98 + noise(2), 1) : null,
        armCm: girths ? round(30 - progress * 0.4, 1) : null,
        thighCm: girths ? round(56 - progress * 0.8, 1) : null,
        chestCm: girths ? round(95 - progress * 1.2, 1) : null,
        bodyFatPct: null,
      });
    }
  });
  // A altura também na medição mais recente: o "atual" não aponta para o primeiro dia do período.
  const lastBody = body.at(-1);
  if (lastBody && lastBody.heightCm === null) lastBody.heightCm = 170;

  return { today, sleep, habits, checks, body, ...generateRoutine(days, start, timeZone) };
}

/** Ruído fixo em [-0,5; 0,5) por dia e campo, sem consumir o gerador pseudoaleatório. */
function fixedNoise(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/**
 * Descrições fictícias de refeição: só dizem o que foi comido, sem rótulo de bom/ruim (LEG-M07).
 */
const MEAL_DESCRIPTIONS: Record<MealCategory, readonly string[]> = {
  breakfast: ['Pão com queijo e café', 'Iogurte com fruta', 'Tapioca e café com leite'],
  lunch: ['Arroz, feijão, frango e salada', 'Macarrão com molho de tomate', 'Peixe com legumes'],
  dinner: ['Sopa de legumes', 'Omelete com salada', 'Sanduíche e suco'],
  snack: ['Fruta', 'Castanhas', 'Bolo caseiro'],
  other: ['Lanche rápido'],
};

const ACTIVITY_NOTES = ['Treino tranquilo.', 'Fui com uma amiga.', 'Parque cheio hoje.'];

/** Exercícios de força fictícios, com a carga inicial (kg) e o passo da progressão. */
const STRENGTH = [
  { exercise: 'Agachamento', reps: 10, load: 20, step: 2.5 },
  { exercise: 'Remada', reps: 12, load: 15, step: 1.5 },
  { exercise: 'Flexão', reps: 8, load: null, step: 0 },
] as const;

/**
 * Alimentação, atividade, metas e lembretes da demo (Fase 4). PRNG PRÓPRIO (outra semente): os sorteios
 * dos dados anteriores (sono, hábitos, corpo) continuam idênticos.
 */
function generateRoutine(
  days: string[],
  start: string,
  timeZone: string,
): Pick<DemoDataset, 'meals' | 'water' | 'activities' | 'goals' | 'reminders'> {
  const rand = prng(DEMO_SEED + 4);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
  const meals: MealRecord[] = [];
  const water: WaterRecord[] = [];
  const activities: ActivityRecord[] = [];

  days.forEach((day, i) => {
    const wd = weekday(day);
    const progress = i / DEMO_DAYS;

    // Refeições: o registro é mais frequente ao longo do período, sem nada de "certo" ou "errado".
    if (rand() < 0.7 + 0.2 * progress) {
      const slots: Array<[MealCategory, number]> = [
        ['breakfast', 7 * 60 + 30],
        ['lunch', 12 * 60 + 30],
        ['dinner', 19 * 60 + 45],
      ];
      if (rand() < 0.5) slots.push(['snack', 16 * 60]);
      slots.forEach(([category, minute], k) => {
        if (rand() < 0.1) return;
        const time = hhmm(minute + (rand() - 0.5) * 40);
        meals.push({
          id: `demo-meal-${i}-${k}`,
          eatenAt: fromLocalDateTime(`${day}T${time}`, timeZone).toISOString(),
          day,
          time,
          category,
          description: rand() < 0.6 ? pick(MEAL_DESCRIPTIONS[category]) : null,
          hunger: rand() < 0.5 ? clampInt(2 + rand() * 3, 1, 5) : null,
          fullness: rand() < 0.5 ? clampInt(2 + rand() * 3, 1, 5) : null,
          satisfaction: rand() < 0.5 ? clampInt(3 + rand() * 2, 1, 5) : null,
          // Estimativa calórica desligada por padrão (LEG-M07): a demo não mostra calorias.
          kcalEstimate: null,
          note: null,
        });
      });
    }

    // Água: alguns copos por dia, em ~80% dos dias.
    if (rand() < 0.8) {
      const cups = 3 + Math.floor(rand() * 4);
      for (let k = 0; k < cups; k++) {
        water.push({ id: `demo-water-${i}-${k}`, day, ml: rand() < 0.5 ? 250 : 300 });
      }
    }

    // Atividade: caminhadas frequentes, força às segundas e quintas, corrida leve aos sábados.
    const push = (
      k: number,
      type: ActivityType,
      minute: number,
      durationMin: number,
      extra: Partial<ActivityRecord> = {},
    ) => {
      const time = hhmm(minute);
      activities.push({
        id: `demo-activity-${i}-${k}`,
        startedAt: fromLocalDateTime(`${day}T${time}`, timeZone).toISOString(),
        day,
        time,
        type,
        durationMin,
        intensity: clampInt(4 + rand() * 4, 1, 10),
        distanceKm: null,
        note: rand() < 0.08 ? pick(ACTIVITY_NOTES) : null,
        sets: [],
        ...extra,
      });
    };
    if (rand() < 0.55 + 0.15 * progress) {
      push(0, 'walking', 18 * 60 + (rand() - 0.5) * 60, clampInt(20 + rand() * 25, 10, 60), {
        distanceKm: round(1.5 + rand() * 2, 1),
      });
    }
    if ((wd === 1 || wd === 4) && rand() < 0.85) {
      const week = Math.floor(i / 7);
      const sets = STRENGTH.flatMap((e, n) =>
        [1, 2, 3].map((k) => ({
          exercise: e.exercise,
          setIndex: n * 3 + k,
          reps: e.load === null ? e.reps + Math.floor(week / 3) : e.reps,
          loadKg: e.load === null ? null : round(e.load + e.step * Math.floor(week / 2), 1),
        })),
      );
      push(1, 'strength', 7 * 60, clampInt(40 + rand() * 15, 30, 70), { sets });
    }
    if (wd === 6 && rand() < 0.6) {
      push(2, 'running', 8 * 60, clampInt(25 + rand() * 15, 20, 50), {
        distanceKm: round(3 + rand() * 2, 1),
      });
    }
  });

  // Metas fictícias, sem meta de peso nem de calorias na demo.
  const goals: GoalRecord[] = [
    { metric: 'sleep_avg_minutes', domain: 'sleep', targetValue: 450 },
    { metric: 'activity_minutes_week', domain: 'activity', targetValue: 150 },
    { metric: 'habit_completion_pct', domain: 'habits', targetValue: 80, habitId: 'demo-habit-1' },
    { metric: 'logging_days_week', domain: 'logging', targetValue: 5 },
  ].map((g, n) => ({
    id: `demo-goal-${n + 1}`,
    domain: g.domain as GoalRecord['domain'],
    metric: g.metric as GoalRecord['metric'],
    targetValue: g.targetValue,
    startValue: null,
    habitId: g.habitId ?? null,
    targetDay: null,
    status: 'active',
    createdDay: start,
  }));

  const reminders: ReminderRecord[] = [
    {
      id: 'demo-reminder-1',
      kind: 'habit',
      habitId: 'demo-habit-2',
      timeMin: 21 * 60 + 30,
      weekdays: [1, 2, 3, 4, 5],
      enabled: true,
    },
    {
      id: 'demo-reminder-2',
      kind: 'daily_log',
      habitId: null,
      timeMin: 20 * 60,
      weekdays: [],
      enabled: true,
    },
  ];

  return { meals, water, activities, goals, reminders };
}
