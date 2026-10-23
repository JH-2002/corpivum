import { screen, within } from '@testing-library/react';
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

describe('formulário de medidas: campo explicado (9d; protocolo do modelo 3D, ADR-0028)', () => {
  it('cada circunferência diz como medir, o que é, um exemplo e a faixa aceita', () => {
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
      expect(input).toHaveAccessibleName(/, em centímetros$/);
      expect(input).toHaveAccessibleDescription(/^Circunferência d/);
      expect(input).toHaveAccessibleDescription(/Formato: 12,3 cm/);
      expect(input).toHaveAccessibleDescription(/Faixa aceita: de \d+ a \d+/);
      const field = input.closest('div.flex-col') as HTMLElement;
      const details = within(field).getByText('Como medir').closest('details');
      expect(details).not.toHaveAttribute('open');
      expect(details).toHaveTextContent(how);
      // Formulário leve (9d1): uma linha visível (o que é + faixa); o exemplo fica no "Como medir" fechado.
      const line = [...field.querySelectorAll('p')].filter((p) => !p.closest('details'));
      expect(line).toHaveLength(1);
      expect(line[0]).toHaveTextContent(/^Circunferência d.*\. Faixa aceita: de \d+ a \d+\.$/);
      expect(details).toHaveTextContent('Formato: 12,3 cm');
      const text = field.textContent ?? '';
      expect(findForbiddenTerms(text).map((t) => t.id)).toEqual([]);
    }
  });

  it('a unidade aparece dentro do campo e no nome acessível', () => {
    renderWithIntl(<BodyForm values={empty} maxDateTime="2026-10-09T23:59" />);
    const weight = screen.getByLabelText(/^Peso/);
    expect(weight).toHaveAccessibleName('Peso, em quilogramas');
    expect(weight.parentElement).toHaveTextContent(/^kg$/);
    expect(screen.getByLabelText(/^Gordura/)).toHaveAccessibleName(
      'Gordura corporal, em porcentagem',
    );
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
