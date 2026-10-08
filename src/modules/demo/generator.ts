import { addDays, eachDay, fromLocalDateTime, weekday } from '@/lib/dates';
import { round } from '@/lib/stats';
import type { BodyRecord } from '@/modules/body';
import type { HabitCheckRecord, HabitRecord } from '@/modules/habits';
import type { JournalRecord, JournalTag } from '@/modules/journal';
import type { MoodEmotion, MoodRecord } from '@/modules/mood';
import type { SleepRecord } from '@/modules/sleep';

/**
 * Dados de demonstração 100% FICTÍCIOS (LEG-X02, CLAUDE.md regra 6, §40). Gerador determinístico (PRNG
 * com semente fixa), com datas relativas a `today`: 90 dias coerentes (noites mais curtas tendem a vir
 * antes de dias com humor/energia mais baixos). Não lê nem grava nada: tudo em memória.
 * Nenhum nome, e-mail ou texto de pessoa real; as frases são escritas para a demo.
 */
export const DEMO_DAYS = 90;
export const DEMO_SEED = 360;

export interface DemoDataset {
  today: string;
  sleep: SleepRecord[];
  mood: MoodRecord[];
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  journal: JournalRecord[];
  body: BodyRecord[];
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

const MOOD_NOTES = [
  'Dia produtivo no trabalho.',
  'Caminhada no fim da tarde ajudou a desligar.',
  'Semana corrida.',
  'Almoço com amigos.',
];

const JOURNAL_TEXTS: Array<{ text: string; tags: JournalTag[] }> = [
  {
    text: 'Hoje organizei a semana e consegui terminar as tarefas pendentes. Quero manter o ritmo.',
    tags: ['work', 'routine'],
  },
  {
    text: 'Passei a tarde no parque. Fazia tempo que não ficava um tempo ao ar livre sem pressa.',
    tags: ['nature', 'leisure'],
  },
  {
    text: 'Jantar com a família. Conversamos bastante e rimos de histórias antigas.',
    tags: ['family'],
  },
  {
    text: 'Dia cansativo. Fui dormir cedo para descansar melhor amanhã.',
    tags: ['rest'],
  },
  {
    text: 'Comecei um curso online. Estudei uma hora antes do jantar.',
    tags: ['study'],
  },
  {
    text: 'Treino leve de manhã e um bom café depois. Gosto de começar o dia assim.',
    tags: ['movement', 'routine'],
  },
  {
    text: 'Encontrei amigos que não via há meses. Combinamos de repetir logo.',
    tags: ['friends', 'leisure'],
  },
];

const EMOTIONS_BY_MOOD: Record<number, MoodEmotion[]> = {
  1: ['tiredness', 'sadness'],
  2: ['tiredness', 'worry'],
  3: ['focus', 'boredom'],
  4: ['calm', 'motivation'],
  5: ['joy', 'gratitude'],
};

/** Gera o conjunto de demonstração terminando em `today` (inclusive). */
export function generateDemoData(today: string, timeZone: string): DemoDataset {
  const rand = prng(DEMO_SEED);
  const start = addDays(today, -(DEMO_DAYS - 1));
  const days = eachDay({ from: start, to: today });

  const sleep: SleepRecord[] = [];
  const mood: MoodRecord[] = [];
  const checks: HabitCheckRecord[] = [];
  const journal: JournalRecord[] = [];
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

    // Humor/energia: ~85% dos dias, associados à noite anterior.
    if (rand() < 0.85) {
      const sleepEffect = lastNightHours === null ? 0 : (lastNightHours - 7) * 0.6;
      const m = clampInt(3.3 + sleepEffect + progress * 0.5 + (rand() - 0.5) * 1.6, 1, 5);
      const e = clampInt(3.1 + sleepEffect * 1.2 + (rand() - 0.5) * 1.6, 1, 5);
      const s = clampInt(2.8 + (weekend ? -0.8 : 0.4) + (rand() - 0.5) * 1.6, 1, 5);
      mood.push({
        id: `demo-mood-${i}`,
        loggedAt: fromLocalDateTime(
          `${day}T${hhmm(19 * 60 + rand() * 120)}`,
          timeZone,
        ).toISOString(),
        day,
        mood: m,
        energy: e,
        stress: s,
        emotions: (EMOTIONS_BY_MOOD[m] ?? []).filter(() => rand() < 0.7),
        note: rand() < 0.1 ? (MOOD_NOTES[Math.floor(rand() * MOOD_NOTES.length)] ?? null) : null,
      });
    }

    // Hábitos.
    if (rand() < 0.6 + 0.25 * progress) checks.push({ habitId: 'demo-habit-1', day });
    if (!weekend && rand() < 0.7) checks.push({ habitId: 'demo-habit-2', day });
    if ([1, 3, 5].includes(wd) && rand() < 0.75) checks.push({ habitId: 'demo-habit-3', day });

    // Diário: ~3 entradas por semana.
    if (rand() < 0.4) {
      const entry = JOURNAL_TEXTS[Math.floor(rand() * JOURNAL_TEXTS.length)] ?? JOURNAL_TEXTS[0];
      if (entry) {
        journal.push({
          id: `demo-journal-${i}`,
          day,
          mood: mood.at(-1)?.day === day ? (mood.at(-1)?.mood ?? null) : null,
          tags: entry.tags,
          content: entry.text,
        });
      }
    }

    // Corpo: uma medição por semana; altura e circunferências na primeira e a cada 4 semanas. Peito,
    // braço e coxa sem `rand()`, para não mudar a sequência dos demais dados (corpo 3D, ADR-0026).
    weight += (rand() - 0.55) * 0.25;
    if (wd === 1 || i === 0) {
      const monthly = i === 0 || i % 28 < 7;
      body.push({
        id: `demo-body-${i}`,
        measuredAt: fromLocalDateTime(`${day}T07:30`, timeZone).toISOString(),
        day,
        weightKg: round(weight, 1),
        heightCm: i === 0 ? 170 : null,
        waistCm: monthly ? round(86 - progress * 2 + (rand() - 0.5), 1) : null,
        hipCm: monthly ? round(98 + (rand() - 0.5), 1) : null,
        armCm: monthly ? round(30 - progress * 0.4, 1) : null,
        thighCm: monthly ? round(56 - progress * 0.8, 1) : null,
        chestCm: monthly ? round(95 - progress * 1.2, 1) : null,
        bodyFatPct: null,
      });
    }
  });

  journal.reverse();
  return { today, sleep, mood, habits, checks, journal, body };
}
