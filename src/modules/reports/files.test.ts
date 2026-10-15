// @vitest-environment node
import { csvCell, toCsv } from './csv';
import { exportTables, type AccountExport, type HealthRecords } from './dataset';
import { fullExportJson, fullExportZip } from './export';
import { INTERNAL_ONLY_VALUES, mentionsInternalValue } from './internal';
import { calendarRange, isValidReference, previousCalendarRange } from './period';
import { buildZip, crc32, readZip } from './zip';

/** Arquivos da exportação (LEG-D03, ADR-0032): CSV, ZIP, JSON e períodos civis. Dados 100% sintéticos. */
const decoder = new TextDecoder();

const ACCOUNT: AccountExport = {
  email: 'pessoa.ficticia@example.test',
  createdAt: '2026-10-01T12:00:00.000Z',
  emailVerifiedAt: '2026-10-01T12:05:00.000Z',
  mfaEnabled: false,
  dataMode: 'own',
  preferences: {
    streaksEnabled: true,
    calorieEstimateEnabled: false,
    remindHabits: true,
    remindDailyLog: true,
    quietStartMin: null,
    quietEndMin: null,
  },
  consents: [
    {
      purpose: 'health_data',
      policyVersion: 2,
      grantedAt: '2026-10-01T12:06:00.000Z',
      revokedAt: null,
    },
  ],
  documents: [{ document: 'terms', version: 2, kind: 'accepted', at: '2026-10-01T12:06:00.000Z' }],
  privacyRequests: [],
};

const RECORDS: HealthRecords = {
  sleep: [
    {
      id: 's1',
      bedAt: '2026-10-05T02:00:00.000Z',
      wakeAt: '2026-10-05T10:00:00.000Z',
      day: '2026-10-05',
      bedTime: '23:00',
      wakeTime: '07:00',
      quality: 4,
      awakenings: 1,
      note: '=HYPERLINK("http://x")',
    },
  ],
  habits: [
    {
      id: 'h1',
      name: 'Caminhar; "leve"',
      frequency: 'weekdays',
      weekdays: [1, 3, 5],
      timesPerWeek: null,
      archived: false,
      createdDay: '2026-10-01',
    },
  ],
  checks: [{ habitId: 'h1', day: '2026-10-05' }],
  body: [
    {
      id: 'b1',
      measuredAt: '2026-10-05T11:00:00.000Z',
      day: '2026-10-05',
      weightKg: 70.5,
      heightCm: 170,
      waistCm: 80,
      hipCm: 98,
      armCm: 30,
      thighCm: 55,
      chestCm: 95,
      bodyFatPct: null,
    },
  ],
  meals: [],
  water: [{ id: 'w1', day: '2026-10-05', ml: 300 }],
  activities: [
    {
      id: 'a1',
      startedAt: '2026-10-05T21:00:00.000Z',
      day: '2026-10-05',
      time: '18:00',
      type: 'strength',
      durationMin: 40,
      intensity: 6,
      distanceKm: null,
      note: null,
      sets: [{ exercise: 'Agachamento', setIndex: 1, reps: 10, loadKg: 20 }],
    },
  ],
  goals: [],
  reminders: [],
};

const INPUT = {
  generatedAt: new Date('2026-10-14T15:00:00Z'),
  timeZone: 'America/Sao_Paulo',
  notice:
    'Gerado em 14/10/2026. Material de autoacompanhamento, não é laudo nem avaliação clínica.',
  account: ACCOUNT,
  tables: exportTables(RECORDS),
};

describe('CSV (LEG-D03)', () => {
  it('BOM, separador ";", CRLF e aspas', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['x;y', 'diz "oi"'],
        [1.5, null],
      ],
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFFa;b\r\n"x;y";"diz ""oi"""\r\n1.5;\r\n');
  });

  it.each(['=1+1', '+55', '-2', '@SUM(A1)', '\tx'])('neutraliza fórmula em texto: %s', (text) => {
    expect(csvCell(text).replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('números negativos continuam números (não são texto de fórmula)', () => {
    expect(csvCell(-2)).toBe('-2');
    expect(csvCell(true)).toBe('true');
    expect(csvCell(Number.NaN)).toBe('');
  });
});

describe('ZIP sem compressão', () => {
  it('CRC32 de referência', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('ida e volta, com assinatura de fim do diretório central', () => {
    const files = [
      { name: 'a.csv', data: new TextEncoder().encode('ção;1\r\n') },
      { name: 'b.txt', data: new Uint8Array(0) },
    ];
    const zip = buildZip(files, new Date('2026-10-14T15:00:00Z'));
    const view = new DataView(zip.buffer);
    expect(view.getUint32(zip.byteLength - 22, true)).toBe(0x06054b50);
    const back = readZip(zip);
    expect(back.map((f) => f.name)).toEqual(['a.csv', 'b.txt']);
    expect(decoder.decode(back[0]?.data)).toBe('ção;1\r\n');
  });

  it('recusa nome com pasta ou caminho', () => {
    expect(() => buildZip([{ name: '../x.csv', data: new Uint8Array(1) }], new Date())).toThrow();
    expect(() => buildZip([{ name: 'a/b.csv', data: new Uint8Array(1) }], new Date())).toThrow();
  });
});

describe('exportação completa', () => {
  it('JSON versionado, com selo, unidades, conta e todas as tabelas', () => {
    const doc = JSON.parse(decoder.decode(fullExportJson(INPUT))) as {
      schemaVersion: number;
      notice: string;
      account: AccountExport;
      tables: Record<string, { badge: string; units: Record<string, string>; records: unknown[] }>;
    };
    expect(doc.schemaVersion).toBe(1);
    expect(doc.notice).toContain('não é laudo');
    expect(doc.account.email).toBe(ACCOUNT.email);
    expect(Object.keys(doc.tables)).toEqual([
      'sleep',
      'habits',
      'habit_checks',
      'body_measurements',
      'meals',
      'water',
      'activities',
      'strength_sets',
      'goals',
      'reminders',
    ]);
    expect(doc.tables.body_measurements?.badge).toBe('INFORMADO');
    expect(doc.tables.body_measurements?.units.weightKg).toBe('kg');
    expect(doc.tables.strength_sets?.records).toEqual([
      { activityId: 'a1', exercise: 'Agachamento', setIndex: 1, reps: 10, loadKg: 20 },
    ]);
  });

  it('ZIP com README, conta e um CSV por tabela; CSV seguro para planilha', () => {
    const files = readZip(fullExportZip(INPUT));
    const names = files.map((f) => f.name);
    expect(names).toContain('README.txt');
    expect(names).toContain('account.csv');
    expect(names).toContain('consents.csv');
    expect(names).toContain('body_measurements.csv');
    const sleep = decoder.decode(files.find((f) => f.name === 'sleep.csv')?.data);
    expect(sleep).toContain(`"'=HYPERLINK(""http://x"")"`);
    const habits = decoder.decode(files.find((f) => f.name === 'habits.csv')?.data);
    expect(habits).toContain('"Caminhar; ""leve"""');
    expect(decoder.decode(files[0]?.data)).toContain('não é laudo');
  });

  it('valores só internos (IMC, cintura/quadril) nunca saem (LEG-M06)', () => {
    const json = decoder.decode(fullExportJson(INPUT));
    expect(mentionsInternalValue(json)).toBe(false);
    for (const f of readZip(fullExportZip(INPUT))) {
      expect(mentionsInternalValue(decoder.decode(f.data)), f.name).toBe(false);
    }
    for (const name of INTERNAL_ONLY_VALUES)
      expect(mentionsInternalValue(`x ${name} y`)).toBe(true);
  });
});

describe('períodos civis (§29)', () => {
  const TODAY = '2026-10-14'; // quarta-feira

  it('semana de segunda a domingo, mês e ano, sem dias futuros', () => {
    expect(calendarRange('week', '2026-10-07', TODAY)).toEqual({
      from: '2026-10-05',
      to: '2026-10-11',
    });
    expect(calendarRange('week', TODAY, TODAY)).toEqual({ from: '2026-10-12', to: TODAY });
    expect(calendarRange('month', '2026-02-10', TODAY)).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(calendarRange('month', '2024-02-10', TODAY).to).toBe('2024-02-29');
    expect(calendarRange('year', '2025-06-01', TODAY)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
    expect(calendarRange('year', TODAY, TODAY)).toEqual({ from: '2026-01-01', to: TODAY });
  });

  it('período anterior de mesmo tipo', () => {
    expect(previousCalendarRange('month', { from: '2026-03-01', to: '2026-03-31' })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(previousCalendarRange('week', { from: '2026-10-12', to: '2026-10-14' })).toEqual({
      from: '2026-10-05',
      to: '2026-10-11',
    });
  });

  it('referência: dia real e não futuro', () => {
    expect(isValidReference('2026-10-14', TODAY)).toBe(true);
    expect(isValidReference('2026-10-15', TODAY)).toBe(false);
    expect(isValidReference('2026-02-30', TODAY)).toBe(false);
    expect(isValidReference('14/10/2026', TODAY)).toBe(false);
  });
});
