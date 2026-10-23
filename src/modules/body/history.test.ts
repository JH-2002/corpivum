import { changeRows, historyRows } from './metrics';
import { BODY_FIELDS, type BodyRecord } from './types';

function rec(day: string, values: Partial<BodyRecord>): BodyRecord {
  const empty = Object.fromEntries(BODY_FIELDS.map((f) => [f, null])) as Record<
    (typeof BODY_FIELDS)[number],
    null
  >;
  return { id: day, measuredAt: `${day}T10:00:00Z`, day, ...empty, ...values };
}

describe('historyRows (Corpo sem duplicação)', () => {
  const records = [
    rec('2026-10-01', { weightKg: 74, heightCm: 170, waistCm: 85 }),
    rec('2026-10-08', { weightKg: 73.8, heightCm: 170 }),
    rec('2026-10-15', { weightKg: 73.5, waistCm: 84.5, heightCm: 170 }),
  ];

  it('da mais recente à mais antiga, só com os campos registrados', () => {
    const rows = historyRows(records);
    expect(rows.map((r) => r.record.day)).toEqual(['2026-10-15', '2026-10-08', '2026-10-01']);
    expect(rows[2]?.fields).toEqual(['weightKg', 'heightCm', 'waistCm']);
  });

  it('a altura só aparece quando muda', () => {
    const rows = historyRows(records);
    expect(rows[1]?.fields).toEqual(['weightKg']);
  });

  it('peso e altura mais recentes ficam só nos blocos de estado atual', () => {
    const rows = historyRows(records);
    expect(rows[0]?.fields).toEqual(['waistCm']);
  });

  it('linha sem campo continua (para editar ou apagar)', () => {
    const rows = historyRows([rec('2026-10-01', { weightKg: 70 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fields).toEqual([]);
  });
});

describe('changeRows (variação desde a primeira medição)', () => {
  it('cada medida parte de zero na sua primeira medição, com null nos dias sem valor', () => {
    const rows = changeRows(
      [
        rec('2026-10-01', { waistCm: 85 }),
        rec('2026-10-08', { waistCm: 84.4, armCm: 31 }),
        rec('2026-10-15', { armCm: 31.5 }),
      ],
      ['waistCm', 'armCm'],
    );
    expect(rows).toEqual([
      { day: '2026-10-01', waistCm: 0, armCm: null },
      { day: '2026-10-08', waistCm: -0.6, armCm: 0 },
      { day: '2026-10-15', waistCm: null, armCm: 0.5 },
    ]);
  });
});
