import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import messages from '@messages/pt-BR.json';
import { AVAILABLE_PURPOSES } from '@/modules/consent';
import { Checkbox } from '@/components/forms/Checkbox';

vi.mock('@/app/(onboarding)/actions', () => ({
  completeOnboardingAction: vi.fn(),
  resolveUpdateAction: vi.fn(),
}));

const { OnboardingConsentForm, UpdateConsentForm } = await import('./OnboardingForms');

function wrap(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages} timeZone="America/Sao_Paulo">
      {children}
    </NextIntlClientProvider>,
  );
}

/** LEG-C02: nenhuma caixa de consentimento vem marcada; cada finalidade tem o texto completo (LEG-C03). */
describe('formulários de consentimento', () => {
  it('onboarding: nenhuma caixa marcada e uma por finalidade oferecida', () => {
    wrap(<OnboardingConsentForm purposes={AVAILABLE_PURPOSES} graceDays={30} />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2 + AVAILABLE_PURPOSES.length);
    for (const box of boxes) expect(box).not.toBeChecked();
    for (const purpose of AVAILABLE_PURPOSES) {
      expect(
        screen.getByRole('checkbox', { name: messages.consent.purposes[purpose].title }),
      ).toBeInTheDocument();
    }
    expect(screen.getAllByText('Quem processa e onde')).toHaveLength(AVAILABLE_PURPOSES.length);
    expect(screen.getByText(/eliminados depois de 30 dias/)).toBeInTheDocument();
  });

  it('atualização: nenhuma opção pré-selecionada', () => {
    wrap(<UpdateConsentForm documents={['terms']} purposes={['health_data']} graceDays={30} />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('Checkbox não aceita pré-marcação: o tipo barra e o componente descarta', () => {
    // @ts-expect-error defaultChecked não faz parte das props (LEG-C02)
    render(<Checkbox name="x" label="Rótulo" defaultChecked />);
    expect(screen.getByRole('checkbox', { name: 'Rótulo' })).not.toBeChecked();
  });
});
