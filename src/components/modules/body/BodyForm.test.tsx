import { screen } from '@testing-library/react';
import { findForbiddenTerms } from '../../../../tests/content/forbidden-terms';
import { renderWithIntl } from '../../../../tests/render';
import { BodyForm, type BodyFormValues } from './BodyForm';

vi.mock('@/app/(app)/corpo/actions', () => ({ saveBodyAction: vi.fn() }));

const empty: BodyFormValues = {
  measuredAt: '2026-10-09T08:00',
  weightKg: null,
  heightCm: null,
  waistCm: null,
  hipCm: null,
  armCm: null,
  thighCm: null,
  chestCm: null,
  bodyFatPct: null,
};

describe('formulário de medidas: como medir (protocolo do modelo 3D, ADR-0028)', () => {
  it('cada circunferência tem a dica de como medir, ligada ao campo, além da faixa aceita', () => {
    renderWithIntl(<BodyForm values={empty} maxDateTime="2026-10-09T23:59" />);
    const cases: [RegExp, RegExp][] = [
      [/^Peito/, /passando pelos mamilos/],
      [/^Cintura/, /parte mais estreita entre as costelas e o quadril/],
      [/^Quadril/, /parte mais larga dos glúteos/],
      [/^Coxa/, /logo abaixo da virilha/],
      [/^Braço/, /meio do braço, entre o ombro e o cotovelo/],
    ];
    for (const [label, how] of cases) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAccessibleDescription(how);
      expect(input).toHaveAccessibleDescription(/Faixa aceita: de \d+ a \d+/);
      const description = (input.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
      expect(findForbiddenTerms(description).map((t) => t.id)).toEqual([]);
    }
    // Peso e altura não ganham dica de como medir.
    expect(screen.getByLabelText(/^Peso/)).not.toHaveAccessibleDescription(/Como medir/);
  });
});

describe('formulário de medidas em modo exemplo (demo, ADR-0047)', () => {
  it('sai sem a server action e o envio é impedido', () => {
    const { container } = renderWithIntl(
      <BodyForm values={{ ...empty, weightKg: 73.9 }} maxDateTime="2026-10-09T23:59" example />,
    );
    const form = container.querySelector('form');
    expect(form).not.toHaveAttribute('action');
    const submit = new Event('submit', { cancelable: true, bubbles: true });
    form?.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
  });
});
