import { screen } from '@testing-library/react';
import { addDays } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { generateDemoData } from '@/modules/demo/generator';
import { createDemoSource } from '@/modules/health/source';
import { renderWithIntl } from '../../../../tests/render';
import { BodyView } from './BodyView';

vi.mock('@/app/(app)/corpo/actions', () => ({
  saveBodyAction: vi.fn(),
  deleteBodyAction: vi.fn(),
}));

const TODAY = '2026-10-07';
const range: DateRange = { from: addDays(TODAY, -29), to: TODAY };
const source = createDemoSource(generateDemoData(TODAY, 'America/Sao_Paulo'));

describe('corpo sem dado repetido (revisão da 9d0)', () => {
  it('a variação do peso aparece só nos Destaques, não num bloco a mais', async () => {
    const records = await source.body(range);
    renderWithIntl(
      <BodyView
        records={records}
        latestHeightCm={null}
        range={range}
        today={TODAY}
        mode="publicDemo"
      />,
    );
    expect(screen.getAllByText('Variação do peso (kg)')).toHaveLength(1);
    expect(screen.queryByText('Variação no período')).toBeNull();
    expect(screen.getByText('Peso mais recente')).toBeVisible();
  });
});
