import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { generateDemoData } from '@/modules/demo/generator';
import { brainThemes } from '@/modules/insights';
import {
  bodyEntry,
  checksOn,
  day,
  habit,
  moodWeek,
  sleepWeek,
  TODAY,
  WEEK,
} from '@/modules/insights/fixtures';
import { toTwinRows } from '@/modules/twin';
import { findForbiddenTerms } from '../../../tests/content/forbidden-terms';
import { renderWithIntl } from '../../../tests/render';
import { BodyTwin } from './BodyTwin';
import { BrainTwin } from './BrainTwin';
import { TwinBodyView, TwinBrainView } from './TwinViews';

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

  it('Antes × Agora: diferença em número, seta e palavra; modo privacidade oculta números', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <BodyTwin rows={toTwinRows(records)} latestHeightCm={null} demo={false} describedBy="x" />,
    );
    const table = screen.getByRole('table', { name: /Medidas nas duas datas/ });
    const waistRow = within(table).getByRole('row', { name: /Cintura/ });
    expect(waistRow).toHaveTextContent('80 cm');
    expect(waistRow).toHaveTextContent('+1,5 cm (subiu)');
    expect(within(table).getByRole('row', { name: /Peito/ })).toHaveTextContent('sem registro');

    await user.click(screen.getByRole('button', { name: 'Ocultar valores' }));
    expect(waistRow).not.toHaveTextContent('80 cm');
    expect(waistRow).toHaveTextContent('oculto');
    expect(screen.queryByText(/71 kg/)).toBeNull();
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

describe('cérebro 3D educativo (§17, §18, LEG-M05)', () => {
  const themes = brainThemes({
    sleep: sleepWeek(WEEK, [420, 400, 450, 430, 410, 400, 420]),
    mood: moodWeek(WEEK, [4, 3, 4, 4, 3, 4, 4]),
    previousMood: [],
    habits: [habit()],
    checks: checksOn('h1', [day(0), day(1)]),
    range: WEEK,
  });

  it('avisos obrigatórios sempre visíveis, também na versão 2D', () => {
    renderWithIntl(<BrainTwin themes={themes} demo={false} describedBy="x" />);
    expect(screen.getByTestId('brain-2d')).toBeInTheDocument();
    const note = screen.getByTestId('brain-disclaimers');
    expect(note).toHaveTextContent('não uma medição cerebral');
    expect(note).toHaveTextContent('Não é medição laboratorial');
  });

  it('painel: função geral, seus registros, dados usados e confiança pelo tema menos coberto', async () => {
    const user = userEvent.setup();
    renderWithIntl(<BrainTwin themes={themes} demo={false} describedBy="x" />);
    const frontal = screen.getByRole('button', { name: 'Lobo frontal' });
    await user.click(frontal);
    const panel = document.getElementById(frontal.getAttribute('aria-controls')!)!;
    expect(panel).toHaveTextContent('Conteúdo educativo');
    expect(panel).toHaveTextContent('planejamento');
    expect(panel).toHaveTextContent('Sono médio por noite');
    expect(panel).toHaveTextContent('Eles não indicam nada sobre esta região');
    expect(panel).toHaveTextContent('Hábitos: 2 dias com registro no período');
    // Hábitos com 2 dias: abaixo do mínimo → confiança baixa.
    expect(within(panel).getByTestId('brain-confidence')).toHaveTextContent('Baixo');

    await user.click(screen.getByRole('button', { name: 'Lobo occipital' }));
    expect(panel).toHaveTextContent('só educativo');
    expect(within(panel).getByTestId('brain-confidence')).toHaveTextContent('Não se aplica');
  });

  it('modo privacidade oculta os números do painel', async () => {
    const user = userEvent.setup();
    renderWithIntl(<BrainTwin themes={themes} demo={false} describedBy="x" />);
    await user.click(screen.getByRole('button', { name: 'Tronco encefálico' }));
    await user.click(screen.getByRole('button', { name: 'Ocultar valores' }));
    expect(screen.queryByText(/7 h/)).toBeNull();
    expect(screen.getAllByText('oculto').length).toBeGreaterThan(0);
  });

  it('todas as regiões, com e sem dados e no demo: texto limpo (glossário LEG-M03)', async () => {
    const user = userEvent.setup();
    const demo = generateDemoData(TODAY, 'America/Sao_Paulo');
    const empty = brainThemes({
      sleep: [],
      mood: [],
      previousMood: [],
      habits: [],
      checks: [],
      range: WEEK,
    });
    for (const [data, mode] of [
      [themes, 'own'],
      [empty, 'own'],
      [brainThemes({ ...demo, previousMood: [], range: WEEK }), 'publicDemo'],
    ] as const) {
      const { container, unmount } = renderWithIntl(
        <TwinBrainView themes={data} range={WEEK} today={TODAY} mode={mode} />,
      );
      for (const name of [
        'Lobo frontal',
        'Lobo parietal',
        'Lobo temporal',
        'Lobo occipital',
        'Cerebelo',
        'Tronco encefálico',
      ]) {
        await user.click(screen.getByRole('button', { name }));
        // O namespace disclaimer.* é isento da varredura: tira os avisos antes de varrer.
        const text = (container.textContent ?? '').replace(
          screen.getByTestId('brain-disclaimers').textContent ?? '',
          '',
        );
        expectClean(text);
      }
      unmount();
    }
  });
});
