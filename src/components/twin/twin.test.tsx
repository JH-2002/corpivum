import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { generateDemoData } from '@/modules/demo/generator';
import { bodyEntry, day, TODAY } from '@/modules/insights/fixtures';
import { BODY_MODEL_STORAGE_KEY, DEMO_BODY_MODEL_STORAGE_KEY, toTwinRows } from '@/modules/twin';
import { findForbiddenTerms } from '../../../tests/content/forbidden-terms';
import { renderWithIntl } from '../../../tests/render';
import { PrivacyModeProvider } from '@/components/privacy-mode/PrivacyModeProvider';
import { BodyTwin } from './BodyTwin';
import { TwinBodyView } from './TwinViews';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/privacy-mode-actions', () => ({ setPrivacyModeAction: vi.fn() }));

/**
 * Health Twin (ADR-0026). O jsdom não tem WebGL: os testes passam pela versão 2D, com os mesmos
 * controles, painel e textos. Dados sintéticos (CLAUDE.md regra 6).
 */
beforeAll(() => {
  // jsdom não implementa canvas: sem isto, cada detecção de WebGL registra um erro no console.
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const records = [
  bodyEntry(day(0), { weightKg: 70, heightCm: 172, waistCm: 80, hipCm: 96 }),
  bodyEntry(day(6), { weightKg: 71, waistCm: 81.5 }),
];

function expectClean(text: string) {
  expect(text).not.toMatch(/twin\.|insights\.|disclaimer\./);
  expect(text).not.toMatch(/\bimc\b|\bbmi\b/i);
  expect(findForbiddenTerms(text).map((t) => t.id)).toEqual([]);
}

describe('corpo 3D (§15, §16)', () => {
  it('sem WebGL mostra a versão 2D e o aviso', () => {
    renderWithIntl(
      <BodyTwin rows={toTwinRows(records)} latestHeightCm={null} demo={false} describedBy="x" />,
    );
    expect(screen.getAllByTestId('body-2d').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('twin-fallback-notice').length).toBeGreaterThan(0);
  });

  it('região pela lista: medida, data do registro e variação, com selos', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <BodyTwin rows={toTwinRows(records)} latestHeightCm={null} demo={false} describedBy="x" />,
    );
    const waist = screen.getAllByRole('button', { name: 'Cintura' })[0]!;
    await user.click(waist);
    expect(waist).toHaveAttribute('aria-pressed', 'true');
    const panel = document.getElementById(waist.getAttribute('aria-controls')!)!;
    expect(panel).toHaveTextContent('Circunferência: 81,5 cm');
    expect(panel).toHaveTextContent('Variação no período: +1,5 cm');
    expect(within(panel).getAllByRole('button', { name: /Origem do dado/ }).length).toBe(2);

    await user.click(screen.getAllByRole('button', { name: 'Peito' })[0]!);
    expect(panel).toHaveTextContent('Sem medida informada');
  });

  it('controle de datas: medidas vigentes na data escolhida', async () => {
    renderWithIntl(
      <BodyTwin rows={toTwinRows(records)} latestHeightCm={null} demo={false} describedBy="x" />,
    );
    const slider = screen.getByRole('slider', { name: /Data das medidas/ });
    expect(slider).toHaveAttribute('aria-valuetext', '7 de outubro de 2026');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(slider).toHaveAttribute('aria-valuetext', '1 de outubro de 2026');
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Cintura' })[0]!);
    expect(screen.getByText('Circunferência: 80 cm')).toBeInTheDocument();
  });

  it('modelo do corpo: sem padrão, pergunta na primeira vez; escolha só no navegador (ADR-0028)', async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    renderWithIntl(
      <BodyTwin rows={toTwinRows(records)} latestHeightCm={null} demo={false} describedBy="x" />,
    );
    const prompt = screen.getByRole('region', { name: 'Qual modelo você prefere ver?' });
    expect(prompt).toHaveTextContent('Só muda a aparência; fica salvo neste navegador.');
    expect(screen.queryByRole('group', { name: 'Modelo do corpo' })).not.toBeInTheDocument();
    expectClean(prompt.textContent ?? '');

    await user.click(within(prompt).getByRole('button', { name: 'Feminino' }));
    expect(window.localStorage.getItem(BODY_MODEL_STORAGE_KEY)).toBe('feminine');
    expect(
      screen.queryByRole('region', { name: 'Qual modelo você prefere ver?' }),
    ).not.toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Modelo do corpo' });
    expect(within(group).getByRole('radio', { name: 'Feminino' })).toBeChecked();
    expect(within(group).queryByRole('radio', { name: /Neutro/ })).not.toBeInTheDocument();
    await user.click(within(group).getByRole('radio', { name: 'Masculino' }));
    expect(window.localStorage.getItem(BODY_MODEL_STORAGE_KEY)).toBe('masculine');

    // Escolha antiga ("neutral") ou inválida: volta a perguntar.
    window.localStorage.setItem(BODY_MODEL_STORAGE_KEY, 'neutral');
    window.dispatchEvent(new Event('storage'));
    expect(
      await screen.findByRole('region', { name: 'Qual modelo você prefere ver?' }),
    ).toBeInTheDocument();
    window.localStorage.clear();
  });

  it('demo: a pessoa fictícia já tem modelo, sem pergunta; a troca não vira a escolha da conta (ADR-0049)', async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    renderWithIntl(
      <BodyTwin rows={toTwinRows(records)} latestHeightCm={null} demo describedBy="x" />,
    );
    const body = screen.getByRole('region', { name: /corpo em 3D/ });
    expect(within(body).queryByRole('heading', { name: /Qual modelo/ })).toBeNull();
    await user.click(within(body).getByRole('button', { name: 'Cintura' }));
    // Perfil do modelo da demo (masculino): cintura de referência 80 cm.
    expect(body).toHaveTextContent('80 cm');
    expect(screen.getByRole('radio', { name: 'Masculino' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Feminino' }));
    expect(body).toHaveTextContent('68 cm');
    expect(window.localStorage.getItem(DEMO_BODY_MODEL_STORAGE_KEY)).toBe('feminine');
    expect(window.localStorage.getItem(BODY_MODEL_STORAGE_KEY)).toBeNull();
    window.localStorage.clear();
  });

  it('conta real sem escolha: pergunta o modelo, mesmo depois de trocar na demo', () => {
    window.localStorage.clear();
    window.localStorage.setItem(DEMO_BODY_MODEL_STORAGE_KEY, 'feminine');
    renderWithIntl(
      <BodyTwin rows={toTwinRows(records)} latestHeightCm={null} demo={false} describedBy="x" />,
    );
    expect(screen.getAllByRole('button', { name: 'Feminino' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('radio', { name: 'Feminino' })).toBeNull();
    window.localStorage.clear();
  });
  it('medida além da faixa do desenho: o painel avisa, sem número do modelo (ADR-0028)', async () => {
    window.localStorage.setItem(BODY_MODEL_STORAGE_KEY, 'masculine');
    const user = userEvent.setup();
    const rows = toTwinRows([bodyEntry(day(0), { heightCm: 175, waistCm: 170, hipCm: 98 })]);
    renderWithIntl(<BodyTwin rows={rows} latestHeightCm={null} demo={false} describedBy="x" />);
    const body = screen.getByRole('region', { name: /corpo em 3D/ });
    await user.click(within(body).getByRole('button', { name: 'Cintura' }));
    expect(body).toHaveTextContent('Fora da faixa do desenho');
    await user.click(within(body).getByRole('button', { name: 'Quadril' }));
    expect(body).not.toHaveTextContent('Fora da faixa do desenho');
    expectClean(body.textContent ?? '');
    window.localStorage.clear();
  });

  it('vistas e restaurar pelo teclado', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <BodyTwin rows={toTwinRows(records)} latestHeightCm={null} demo={false} describedBy="x" />,
    );
    const [front] = screen.getAllByRole('button', { name: 'Frente' });
    const [side] = screen.getAllByRole('button', { name: 'Lado' });
    expect(front).toHaveAttribute('aria-pressed', 'true');
    side!.focus();
    await user.keyboard('{Enter}');
    expect(side).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getAllByRole('button', { name: 'Restaurar visão' })[0]!);
    expect(front).toHaveAttribute('aria-pressed', 'true');
  });

  it('Antes × Agora: diferença em número, seta e palavra', () => {
    renderWithIntl(
      <BodyTwin rows={toTwinRows(records)} latestHeightCm={null} demo={false} describedBy="x" />,
    );
    const table = screen.getByRole('table', { name: /Medidas nas duas datas/ });
    const waistRow = within(table).getByRole('row', { name: /Cintura/ });
    expect(waistRow).toHaveTextContent('80 cm');
    expect(waistRow).toHaveTextContent('+1,5 cm (subiu)');
    expect(within(table).getByRole('row', { name: /Peito/ })).toHaveTextContent('sem registro');
    // O botão local saiu: ocultar valores é o modo privacidade global (ADR-0035).
    expect(screen.queryByRole('button', { name: 'Ocultar valores' })).toBeNull();
  });

  it('modo privacidade: "oculto" em todo valor, inclusive sem registro e na direção', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <BodyTwin
        rows={toTwinRows(records)}
        latestHeightCm={null}
        demo={false}
        describedBy="x"
        hidden
      />,
    );
    const table = screen.getByRole('table', { name: /Medidas nas duas datas/ });
    for (const row of within(table).getAllByRole('row').slice(1)) {
      expect(row).toHaveTextContent('oculto');
      expect(row).not.toHaveTextContent(/\d+(,\d+)? ?(cm|kg)|subiu|desceu|sem registro/);
    }
    const waist = screen.getAllByRole('button', { name: 'Cintura' })[0]!;
    await user.click(waist);
    const panel = document.getElementById(waist.getAttribute('aria-controls')!)!;
    expect(panel).toHaveTextContent('Circunferência: oculto');
    expect(document.body.textContent).not.toMatch(/\d+(,\d+)? ?(cm|kg)\b/);
  });

  it('uma data só: comparação explica que precisa de duas', () => {
    renderWithIntl(
      <BodyTwin
        rows={toTwinRows(records.slice(0, 1))}
        latestHeightCm={null}
        demo
        describedBy="x"
      />,
    );
    expect(screen.getByText(/pelo menos duas datas/)).toBeInTheDocument();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('tela completa (próprio, demo e sem dados): texto limpo, aviso do modelo, sem IMC', () => {
    const demo = generateDemoData(TODAY, 'America/Sao_Paulo');
    for (const [list, mode] of [
      [records, 'own'],
      [demo.body, 'publicDemo'],
      [[], 'own'],
    ] as const) {
      const { container, unmount } = renderWithIntl(
        <TwinBodyView
          records={[...list]}
          latestHeightCm={170}
          range={{ from: '2026-07-01', to: TODAY }}
          today={TODAY}
          mode={mode}
        />,
      );
      const disclaimer = screen.getByTestId('body-disclaimer').textContent ?? '';
      expect(disclaimer).toContain('Não é avaliação corporal');
      // O namespace disclaimer.* é isento da varredura (LEG-M03).
      expectClean((container.textContent ?? '').replace(disclaimer, ''));
      unmount();
    }
  });
});

describe('espera do modelo em holograma (ADR-0028, revisão de carregamento)', () => {
  it('silhueta genérica com texto; pulsa só sem prefers-reduced-motion', async () => {
    const { HoloLoading } = await import('./HoloLoading');
    const { container, unmount } = renderWithIntl(<HoloLoading />);
    expect(screen.getByText('Carregando o modelo 3D…')).toBeInTheDocument();
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('animate-pulse');
    expect(svg?.getAttribute('class')).toContain('motion-reduce:animate-none');
    unmount();
    renderWithIntl(<HoloLoading reason="choose" />);
    expect(
      screen.getByText('O corpo em 3D aparece depois que você escolher o modelo.'),
    ).toBeInTheDocument();
  });
});

describe('ajustes da 9c na tela do twin', () => {
  const full = [
    bodyEntry(day(0), { weightKg: 70, heightCm: 172 }),
    bodyEntry(day(6), {
      weightKg: 71,
      chestCm: 95,
      armCm: 30,
      waistCm: 81.5,
      hipCm: 96,
      thighCm: 56,
    }),
  ];

  it('abre com a primeira região que tem medida (Peito), como o início', () => {
    window.localStorage.setItem(BODY_MODEL_STORAGE_KEY, 'feminine');
    renderWithIntl(
      <BodyTwin rows={toTwinRows(full)} latestHeightCm={null} demo={false} describedBy="x" />,
    );
    const body = screen.getByRole('region', { name: /corpo em 3D/ });
    expect(within(body).getByRole('button', { name: 'Peito' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(body).toHaveTextContent('95 cm');
    window.localStorage.clear();
  });

  it('modo privacidade ligado no cliente, antes da recarga: medidas próprias já somem', () => {
    window.localStorage.setItem(BODY_MODEL_STORAGE_KEY, 'feminine');
    renderWithIntl(
      <PrivacyModeProvider initialHidden>
        <BodyTwin rows={toTwinRows(full)} latestHeightCm={null} demo={false} describedBy="x" />
      </PrivacyModeProvider>,
    );
    const body = screen.getByRole('region', { name: /corpo em 3D/ });
    expect(body).not.toHaveTextContent('95 cm');
    expect(body).not.toHaveTextContent('81,5');
    window.localStorage.clear();
  });
});
