import {
  addDays,
  dayStart,
  daysBetween,
  eachDay,
  groupByWeek,
  fromLocalDateTime,
  localDay,
  localTime,
  previousRange,
  rangeBounds,
  rangeLength,
  toLocalDateTime,
  weekday,
} from './dates';

const TZ = 'America/Sao_Paulo';

describe('datas no fuso da pessoa', () => {
  it('converte horário local de São Paulo (UTC-3) para UTC e de volta', () => {
    const instant = fromLocalDateTime('2026-10-07T23:30', TZ);
    expect(instant.toISOString()).toBe('2026-10-08T02:30:00.000Z');
    expect(localDay(instant, TZ)).toBe('2026-10-07');
    expect(localTime(instant, TZ)).toBe('23:30');
    expect(toLocalDateTime(instant, TZ)).toBe('2026-10-07T23:30');
  });

  it('respeita fusos com horário de verão', () => {
    expect(fromLocalDateTime('2026-07-01T12:00', 'Europe/Lisbon').toISOString()).toBe(
      '2026-07-01T11:00:00.000Z',
    );
    expect(fromLocalDateTime('2026-01-01T12:00', 'Europe/Lisbon').toISOString()).toBe(
      '2026-01-01T12:00:00.000Z',
    );
  });

  it('recusa formatos inválidos', () => {
    expect(() => fromLocalDateTime('2026-10-07 23:30', TZ)).toThrow(RangeError);
    expect(() => dayStart('07/10/2026', TZ)).toThrow(RangeError);
  });

  it('aritmética de dias e intervalos', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysBetween('2026-10-01', '2026-10-07')).toBe(6);
    expect(eachDay({ from: '2026-10-05', to: '2026-10-07' })).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
    expect(rangeLength({ from: '2026-10-01', to: '2026-10-07' })).toBe(7);
    expect(previousRange({ from: '2026-10-01', to: '2026-10-07' })).toEqual({
      from: '2026-09-24',
      to: '2026-09-30',
    });
    expect(weekday('2026-10-04')).toBe(0);
  });

  it('limites UTC do intervalo cobrem o dia local inteiro', () => {
    const b = rangeBounds({ from: '2026-10-01', to: '2026-10-01' }, TZ);
    expect(b.gte.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(b.lt.toISOString()).toBe('2026-10-02T03:00:00.000Z');
  });
});

describe('groupByWeek', () => {
  it('agrupa de segunda a domingo, da semana mais recente para a mais antiga', () => {
    // 2026-10-12 é segunda; 2026-10-18, domingo.
    const days = ['2026-10-19', '2026-10-18', '2026-10-12', '2026-10-11', '2026-10-20'];
    const weeks = groupByWeek(days, (d) => d);
    expect(weeks.map((w) => [w.start, w.end])).toEqual([
      ['2026-10-19', '2026-10-25'],
      ['2026-10-12', '2026-10-18'],
      ['2026-10-05', '2026-10-11'],
    ]);
    expect(weeks[0]?.items).toEqual(['2026-10-19', '2026-10-20']);
    expect(weeks[1]?.items).toEqual(['2026-10-18', '2026-10-12']);
  });

  it('não perde nem inventa itens', () => {
    expect(groupByWeek([], (d: string) => d)).toEqual([]);
    const days = ['2026-10-01', '2026-10-02', '2026-10-30'];
    expect(groupByWeek(days, (d) => d).flatMap((w) => w.items)).toHaveLength(3);
  });
});
