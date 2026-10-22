// @vitest-environment node
import { readFileSync } from 'node:fs';
import { isClientModule, pageFiles, routeKey, scan } from '../../scripts/i18n-client-namespaces';
import { pickMessages, routeMessages, shellMessages } from './client-messages';
import { ROUTE_NAMESPACES, SHELL_NAMESPACES } from './client-namespaces.generated';

describe('mensagens do navegador por rota (ADR-0052)', () => {
  const current = scan();

  it('o mapa gerado está em dia com os componentes de cliente (rode `pnpm i18n:client`)', () => {
    expect([...SHELL_NAMESPACES]).toEqual(current.shell);
    expect(
      Object.fromEntries(Object.entries(ROUTE_NAMESPACES).map(([k, v]) => [k, [...v]])),
    ).toEqual(current.routes);
  });

  it('toda página com componente de cliente traduzido usa withRouteMessages com a própria pasta', () => {
    for (const file of pageFiles()) {
      const key = routeKey(file);
      if (current.routes[key]?.length === 0) continue;
      expect(readFileSync(file, 'utf8'), file).toContain(`withRouteMessages('${key}',`);
    }
  });

  it('o shell e as páginas não levam o catálogo inteiro', () => {
    const shell = shellMessages(false);
    expect(Object.keys(shell)).not.toContain('privacyCenter');
    expect(Object.keys(shell)).not.toContain('legal');
    const inicio = routeMessages('(app)/inicio', false);
    expect(Object.keys(inicio)).not.toContain('privacyCenter');
    expect(Object.keys(inicio)).not.toContain('insights');
    expect(Object.keys(routeMessages('(app)/privacidade', false))).toContain('privacyCenter');
  });

  it('no modo só demo, nunca os textos jurídicos', () => {
    const all = [
      shellMessages(true),
      ...Object.keys(ROUTE_NAMESPACES).map((r) =>
        routeMessages(r as keyof typeof ROUTE_NAMESPACES, true),
      ),
    ];
    for (const m of all) {
      expect(m).not.toHaveProperty('legal');
      expect(m).not.toHaveProperty('consent');
    }
  });
});

describe('pickMessages', () => {
  const catalog = { a: { x: '1', y: { z: '2' } }, b: '3', c: { w: '4' } };

  it('copia só os ramos pedidos', () => {
    expect(pickMessages(catalog, ['a.y', 'b'])).toEqual({ a: { y: { z: '2' } }, b: '3' });
    expect(pickMessages(catalog, ['a.x', 'a.y.z'])).toEqual({ a: { x: '1', y: { z: '2' } } });
  });

  it('ignora caminhos que não existem', () => {
    expect(pickMessages(catalog, ['nada', 'a.nada'])).toEqual({ a: {} });
  });
});

describe('avisos obrigatórios chegam aos componentes de cliente (regra 9, LEG-M03)', () => {
  it('apoio CVV/SAMU e guardrails nas metas; avisos e demo no shell', () => {
    for (const route of ['(app)/metas', 'demo/(shell)/metas'] as const) {
      expect(ROUTE_NAMESPACES[route]).toEqual(expect.arrayContaining(['disclaimer', 'guardrails']));
    }
    expect(SHELL_NAMESPACES).toEqual(expect.arrayContaining(['disclaimer', 'demo']));
  });
});

describe('isClientModule', () => {
  it("reconhece 'use client' depois de comentários e linhas em branco", () => {
    expect(isClientModule("'use client';\nx")).toBe(true);
    expect(isClientModule('// cabeçalho\n/* bloco\n */\n\n"use client";')).toBe(true);
    expect(isClientModule("import x from 'y';\n'use client';")).toBe(false);
    expect(isClientModule('/* sem fim')).toBe(false);
  });
});
