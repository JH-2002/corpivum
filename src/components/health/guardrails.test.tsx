import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GUARDRAIL_REASONS } from '@/modules/guardrails';
import { findForbiddenTerms } from '../../../tests/content/forbidden-terms';
import { renderWithIntl } from '../../../tests/render';
import { HelpMenu } from '../shell/HelpMenu';
import { GuardrailNotice } from './GuardrailNotice';

/** Guardrails de imagem corporal e alimentação na interface (LEG-M04, LEG-M07, §48, ADR-0027). */
describe('aviso de guardrail', () => {
  it('cada motivo tem texto, sem números restritivos nem termo proibido, com orientação e apoio', () => {
    const { container } = renderWithIntl(<GuardrailNotice reasons={[...GUARDRAIL_REASONS]} />);
    const notice = screen.getByTestId('guardrail-notice');
    expect(screen.getByRole('heading', { name: 'O app não acompanha esta meta' })).toBeVisible();
    expect(notice.querySelectorAll('li')).toHaveLength(GUARDRAIL_REASONS.length);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/guardrails\./);
    expect(text).toMatch(/profissional de saúde/);
    expect(text).toMatch(/\b188\b/);
    expect(text).toMatch(/\b192\b/);
    // Fora do apoio (telefones e horário), nenhum número: nenhum peso, prazo ou caloria sugerido.
    const section = notice.querySelector('section')?.textContent ?? '';
    expect(section).not.toMatch(/\d/);
    expect(findForbiddenTerms(section).map((t) => t.id)).toEqual([]);
  });

  it('motivo repetido aparece uma vez', () => {
    renderWithIntl(<GuardrailNotice reasons={['pace_too_fast', 'pace_too_fast']} />);
    expect(screen.getByTestId('guardrail-notice').querySelectorAll('li')).toHaveLength(1);
  });
});

describe('"Precisa de ajuda?" no menu de ajuda (§48)', () => {
  it('fica acessível em qualquer tela, com CVV 188 e SAMU 192', async () => {
    renderWithIntl(<HelpMenu tourHref="/inicio?tour=1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Ajuda' }));
    const support = screen.getByTestId('help-support');
    expect(screen.getByRole('heading', { name: 'Precisa de ajuda?' })).toBeVisible();
    expect(support).toHaveTextContent('188');
    expect(support).toHaveTextContent('192');
  });
});
