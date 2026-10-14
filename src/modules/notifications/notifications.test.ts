import { reminderInputSchema, reminderPrefsSchema } from './schemas';
import { formatTime, inQuietHours, nextOccurrence, parseTime, upcoming } from './schedule';
import type { ReminderRecord } from './types';

const TZ = 'America/Sao_Paulo';
const r = (over: Partial<ReminderRecord> = {}): ReminderRecord => ({
  id: 'r1',
  kind: 'daily_log',
  habitId: null,
  timeMin: 20 * 60,
  weekdays: [],
  enabled: true,
  ...over,
});

describe('agenda dos lembretes (§33)', () => {
  it('converte horário e acha a próxima ocorrência no fuso', () => {
    expect(parseTime('07:05')).toBe(425);
    expect(formatTime(425)).toBe('07:05');
    // 2026-10-07 12:00 local → 20:00 local do mesmo dia = 23:00 UTC.
    expect(nextOccurrence(r(), new Date('2026-10-07T15:00:00Z'), TZ).toISOString()).toBe(
      '2026-10-07T23:00:00.000Z',
    );
    // Logo depois do horário: o dia seguinte.
    expect(nextOccurrence(r(), new Date('2026-10-07T23:00:00Z'), TZ).toISOString()).toBe(
      '2026-10-08T23:00:00.000Z',
    );
  });

  it('respeita os dias da semana', () => {
    // 2026-10-07 é quarta; só segundas (1).
    const next = nextOccurrence(r({ weekdays: [1] }), new Date('2026-10-07T15:00:00Z'), TZ);
    expect(next.toISOString()).toBe('2026-10-12T23:00:00.000Z');
  });

  it('horário silencioso, inclusive virando a meia-noite', () => {
    expect(inQuietHours(23 * 60, 22 * 60, 7 * 60)).toBe(true);
    expect(inQuietHours(6 * 60, 22 * 60, 7 * 60)).toBe(true);
    expect(inQuietHours(7 * 60, 22 * 60, 7 * 60)).toBe(false);
    expect(inQuietHours(13 * 60, 12 * 60, 14 * 60)).toBe(true);
    expect(inQuietHours(13 * 60, null, null)).toBe(false);
  });

  it('próximos lembretes: só ativos, em ordem', () => {
    const list = upcoming(
      [
        r({ id: 'a', timeMin: 21 * 60 }),
        r({ id: 'b', timeMin: 13 * 60 }),
        r({ id: 'c', enabled: false }),
      ],
      new Date('2026-10-07T15:00:00Z'),
      TZ,
    );
    expect(list.map((x) => x.reminder.id)).toEqual(['b', 'a']);
  });
});

describe('formulários de lembrete', () => {
  it('lembrete de hábito exige o hábito; todos os dias marcados = sem restrição', () => {
    expect(reminderInputSchema.safeParse({ kind: 'habit', time: '08:00' }).success).toBe(false);
    expect(
      reminderInputSchema.parse({
        kind: 'daily_log',
        time: '08:00',
        weekdays: ['0', '1', '2', '3', '4', '5', '6'],
      }),
    ).toEqual({ kind: 'daily_log', habitId: null, timeMin: 480, weekdays: [] });
    expect(reminderInputSchema.safeParse({ kind: 'daily_log', time: '25:00' }).success).toBe(false);
  });

  it('horário silencioso: os dois horários ou nenhum', () => {
    expect(reminderPrefsSchema.parse({ remindHabits: 'on' })).toEqual({
      remindHabits: true,
      remindDailyLog: false,
      quietStartMin: null,
      quietEndMin: null,
    });
    expect(reminderPrefsSchema.safeParse({ quietStart: '22:00' }).success).toBe(false);
    expect(reminderPrefsSchema.safeParse({ quietStart: '22:00', quietEnd: '22:00' }).success).toBe(
      false,
    );
    expect(reminderPrefsSchema.parse({ quietStart: '22:00', quietEnd: '07:00' })).toMatchObject({
      quietStartMin: 1320,
      quietEndMin: 420,
    });
  });
});
