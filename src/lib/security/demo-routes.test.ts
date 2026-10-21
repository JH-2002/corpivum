// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PAGES } from '../../../e2e/routes';
import { demoOnlyRoute } from './demo-routes';

/** Modo só demo (ADR-0043, D3): só /demo existe. */
const none = new Headers();
const action = new Headers({ 'next-action': 'abc123' });
const redirect = { kind: 'redirect', to: '/demo' };

describe('demoOnlyRoute', () => {
  it('toda página do app completo redireciona para /demo (inventário do e2e)', () => {
    const outside = PAGES.map((p) => p.path).filter(
      (p) => p !== '/demo' && !p.startsWith('/demo/'),
    );
    expect(outside.length).toBeGreaterThan(20);
    for (const path of outside) {
      expect(demoOnlyRoute(path, 'GET', none), path).toEqual(redirect);
    }
  });

  it.each([
    '/',
    '/entrar',
    '/cadastro/conta',
    '/inicio',
    '/privacidade',
    '/boas-vindas/consentimentos',
    '/apresentacao',
    '/legal/politica-de-privacidade',
    '/qualquer-coisa',
    '/demonstracao',
  ])('GET e HEAD %s → /demo', (path) => {
    expect(demoOnlyRoute(path, 'GET', none)).toEqual(redirect);
    expect(demoOnlyRoute(path, 'HEAD', none)).toEqual(redirect);
  });

  it.each(['/demo', '/demo/sono', '/demo/apresentacao', '/demo/sobre'])(
    '%s passa (GET e actions da demo)',
    (path) => {
      expect(demoOnlyRoute(path, 'GET', none)).toEqual({ kind: 'pass' });
      expect(demoOnlyRoute(path, 'POST', action)).toEqual({ kind: 'pass' });
    },
  );

  it('route handlers dão 404, com qualquer método, inclusive sob /api', () => {
    for (const path of [
      '/privacidade/exportacoes/123',
      '/privacidade/exportacoes/123/',
      '/api',
      '/api/x',
    ]) {
      for (const method of ['GET', 'HEAD', 'POST', 'DELETE']) {
        expect(demoOnlyRoute(path, method, none), `${method} ${path}`).toEqual({
          kind: 'notFound',
        });
      }
    }
  });

  it('server action fora de /demo dá 404, mesmo com GET', () => {
    for (const path of ['/', '/entrar', '/inicio', '/privacidade']) {
      expect(demoOnlyRoute(path, 'POST', action)).toEqual({ kind: 'notFound' });
      expect(demoOnlyRoute(path, 'GET', action)).toEqual({ kind: 'notFound' });
    }
  });

  it('outros métodos fora de /demo dão 404', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(demoOnlyRoute('/entrar', method, none)).toEqual({ kind: 'notFound' });
    }
  });
});
