import { activityInputSchema, setsFromForm } from './schemas';
import {
  dailyMinutes,
  exerciseKey,
  exerciseProgression,
  lastChange,
  minutesByType,
  sessionCount,
  totalMinutes,
} from './metrics';
import type { ActivityRecord } from './types';

const rec = (day: string, over: Partial<ActivityRecord> = {}): ActivityRecord => ({
  id: `a-${day}`,
  startedAt: `${day}T10:00:00.000Z`,
  day,
  time: '07:00',
  type: 'walking',
  durationMin: 30,
  intensity: null,
  distanceKm: null,
  note: null,
  sets: [],
  ...over,
});

const RANGE = { from: '2026-10-01', to: '2026-10-07' };

describe('minutos e sessões (§26)', () => {
  it('somam só o intervalo e agrupam por tipo', () => {
    const list = [
      rec('2026-09-30'),
      rec('2026-10-01'),
      rec('2026-10-03', { type: 'running', durationMin: 20 }),
      rec('2026-10-03', { id: 'x', durationMin: 15 }),
    ];
    expect(totalMinutes(list, RANGE)).toBe(65);
    expect(sessionCount(list, RANGE)).toBe(3);
    expect(minutesByType(list, RANGE)).toEqual([
      { type: 'walking', minutes: 45 },
      { type: 'running', minutes: 20 },
    ]);
    const daily = dailyMinutes(list, RANGE);
    expect(daily).toHaveLength(7);
    expect(daily[2]).toEqual({ day: '2026-10-03', minutes: 35 });
    expect(daily[1]).toEqual({ day: '2026-10-02', minutes: null });
  });
});

describe('progressão por exercício (só o próprio histórico, LEG-M08)', () => {
  const strength = (day: string, load: number | null, reps = 10) =>
    rec(day, {
      type: 'strength',
      sets: [
        { exercise: 'Agachamento', setIndex: 1, reps, loadKg: load },
        { exercise: ' agachamento ', setIndex: 2, reps, loadKg: load },
        { exercise: 'Flexão', setIndex: 3, reps: 8, loadKg: null },
      ],
    });

  it('agrupa pelo nome normalizado e resume cada sessão', () => {
    expect(exerciseKey('  Supino   Reto ')).toBe('supino reto');
    const [squat, pushup] = exerciseProgression([
      strength('2026-10-05', 22.5),
      strength('2026-10-01', 20),
    ]);
    expect(squat?.label).toBe('Agachamento');
    expect(squat?.sessions).toEqual([
      { day: '2026-10-01', sets: 2, totalReps: 20, maxLoadKg: 20, volumeKg: 400 },
      { day: '2026-10-05', sets: 2, totalReps: 20, maxLoadKg: 22.5, volumeKg: 450 },
    ]);
    expect(pushup?.sessions[0]).toEqual({
      day: '2026-10-01',
      sets: 1,
      totalReps: 8,
      maxLoadKg: null,
      volumeKg: null,
    });
  });

  it('a mudança compara a última sessão com a anterior; sem dado, não compara', () => {
    const [squat, pushup] = exerciseProgression([
      strength('2026-10-01', 20),
      strength('2026-10-05', 22.5),
    ]);
    expect(lastChange(squat?.sessions ?? [], 'maxLoadKg')).toEqual({
      previous: 20,
      current: 22.5,
      delta: 2.5,
    });
    expect(lastChange(pushup?.sessions ?? [], 'maxLoadKg')).toBeNull();
    expect(lastChange(pushup?.sessions ?? [], 'totalReps')).toEqual({
      previous: 8,
      current: 8,
      delta: 0,
    });
  });
});

describe('formulário de atividade', () => {
  it('linhas de série vazias são ignoradas; as preenchidas são validadas', () => {
    const sets = setsFromForm(['Remada', '', 'Prancha'], ['12', '', ''], ['15,5', '', '']);
    expect(sets).toHaveLength(2);
    const parsed = activityInputSchema.safeParse({
      startedAt: '2026-10-06T07:00',
      type: 'strength',
      durationMin: '40',
      sets,
    });
    // "Prancha" sem repetições: recusado em vez de gravado pela metade.
    expect(parsed.success).toBe(false);
    const ok = activityInputSchema.parse({
      startedAt: '2026-10-06T07:00',
      type: 'strength',
      durationMin: '40',
      sets: [sets[0]],
    });
    expect(ok.sets).toEqual([{ exercise: 'Remada', reps: 12, loadKg: 15.5 }]);
  });
});
