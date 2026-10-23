import { screen, within } from '@testing-library/react';
import { addDays } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { generateDemoData } from '@/modules/demo/generator';
import { createDemoSource } from '@/modules/health/source';
import { renderWithIntl } from '../../../../tests/render';
import { scheduleAxis, SCHEDULE_TICK_HOURS } from './ScheduleChart';
import { SleepView } from './SleepView';

vi.mock('@/app/(app)/sono/actions', () => ({
  saveSleepAction: vi.fn(),
  deleteSleepAction: vi.fn(),
}));

const TODAY = '2026-10-07';
const range: DateRange = { from: addDays(TODAY, -29), to: TODAY };
const source = createDemoSource(generateDemoData(TODAY, 'America/Sao_Paulo'));

describe('eixo do horário de sono (revisão da 9d0)', () => {
  it('tiques a cada 2 h, cobrindo do deitar ao acordar', () => {
    const { domain, ticks } = scheduleAxis([
      { day: '2026-10-01', bedTime: '23:40', wakeTime: '07:10' },
      { day: '2026-10-02', bedTime: '00:30', wakeTime: '08:20' },
    ]);
    expect(domain).toEqual([-2, 10]);
    expect(ticks).toEqual([-2, 0, 2, 4, 6, 8, 10]);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]! - ticks[i - 1]!).toBe(SCHEDULE_TICK_HOURS);
    }
  });

  it('faixa mínima de 8 h para noites curtas e parecidas', () => {
    const { domain, ticks } = scheduleAxis([
      { day: '2026-10-01', bedTime: '01:00', wakeTime: '05:00' },
    ]);
    expect(domain[1] - domain[0]).toBeGreaterThanOrEqual(8);
    expect(ticks[0]).toBe(domain[0]);
    expect(ticks.at(-1)).toBe(domain[1]);
  });
});

describe('noites registradas por semana (revisão da 9d0)', () => {
  it('agrupa por semana e mostra "Ver mais", como as outras listas', async () => {
    const [records, previous] = await Promise.all([
      source.sleep(range, { withText: true }),
      source.sleep({ from: addDays(TODAY, -59), to: addDays(TODAY, -30) }),
    ]);
    renderWithIntl(
      <SleepView
        records={records}
        previous={previous}
        range={range}
        today={TODAY}
        mode="publicDemo"
      />,
    );
    const list = screen.getByRole('region', { name: 'Noites registradas' });
    expect(within(list).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(within(list).getByRole('button', { name: 'Ver mais semanas' })).toBeVisible();
  });
});
