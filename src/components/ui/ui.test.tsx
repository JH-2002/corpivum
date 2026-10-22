import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '../../../tests/render';
import { Button } from './Button';
import { CONFIDENCE_LEVELS, ConfidenceBadge } from './ConfidenceBadge';
import { IconButton } from './IconButton';
import { SkipLink } from './SkipLink';
import { StateView } from './StateView';

describe('StateView', () => {
  it('loading anuncia carregamento para leitores de tela', () => {
    renderWithIntl(<StateView state="loading" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
  });

  it('empty mostra título, descrição e ação da página', () => {
    renderWithIntl(
      <StateView
        state="empty"
        emptyTitle="Nada ainda"
        emptyDescription="Faça um registro"
        action={<a href="#x">Registrar</a>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Nada ainda' })).toBeInTheDocument();
    expect(screen.getByText('Faça um registro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar' })).toBeInTheDocument();
  });

  it('error usa role=alert', () => {
    renderWithIntl(<StateView state="error" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar');
  });

  it('no-data e partial explicam a situação', () => {
    const { unmount } = renderWithIntl(<StateView state="no-data" />);
    expect(screen.getByRole('status')).toHaveTextContent('Sem registros neste período');
    unmount();
    renderWithIntl(
      <StateView state="partial">
        <p>conteúdo parcial</p>
      </StateView>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Dados parciais');
    expect(screen.getByText('conteúdo parcial')).toBeInTheDocument();
  });
});

describe('ConfidenceBadge', () => {
  it.each(CONFIDENCE_LEVELS)('%s tem nome acessível e dica associada', (level) => {
    renderWithIntl(<ConfidenceBadge level={level} />);
    const badge = screen.getByRole('button');
    expect(badge).toHaveAccessibleName(expect.stringContaining('Origem do dado'));
    expect(badge).toHaveAccessibleDescription(/.+/);
  });

  it('níveis reais mostram o texto; DEMO é só o ícone, com o mesmo nome acessível', () => {
    renderWithIntl(
      <>
        <ConfidenceBadge level="INFORMADO" />
        <ConfidenceBadge level="DEMO" />
        <ConfidenceBadge level="DEMO" full />
      </>,
    );
    const [real, demo, demoFull] = screen.getAllByRole('button');
    expect(real).toHaveTextContent('Informado');
    expect(demo).toHaveTextContent('');
    expect(demo).toHaveAccessibleName('Origem do dado: Demo');
    expect(demo).toHaveAccessibleDescription('Dado fictício de demonstração.');
    expect(demo).toHaveClass('min-h-6', 'min-w-6');
    expect(demoFull).toHaveTextContent('Demo');
  });

  it('Esc dispensa a dica até o próximo foco', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ConfidenceBadge level="ESTIMADO" />);
    const tooltip = screen.getByRole('tooltip', { hidden: true });
    const wrapper = tooltip.parentElement!;
    expect(tooltip).toHaveTextContent('Cálculo direto');
    await user.tab();
    expect(wrapper).not.toHaveAttribute('data-dismissed');
    await user.keyboard('{Escape}');
    expect(wrapper).toHaveAttribute('data-dismissed');
    await user.tab({ shift: true });
    await user.tab();
    expect(wrapper).not.toHaveAttribute('data-dismissed');
  });
});

describe('Button e IconButton', () => {
  it('Button é type=button por padrão', () => {
    renderWithIntl(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveAttribute('type', 'button');
  });

  it('IconButton exige nome acessível', () => {
    renderWithIntl(
      <IconButton label="Notificações">
        <svg aria-hidden="true" />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Notificações' })).toBeInTheDocument();
  });
});

describe('SkipLink', () => {
  it('aponta para o conteúdo principal', () => {
    renderWithIntl(<SkipLink />);
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute(
      'href',
      '#conteudo-principal',
    );
  });
});
