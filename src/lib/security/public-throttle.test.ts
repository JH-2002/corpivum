// @vitest-environment node
import { NextRequest } from 'next/server';
import { createThrottle, isLoopback, PUBLIC_LIMITS } from './public-throttle';
import { proxy } from '@/proxy';

describe('limite por IP do que é público (TM-03)', () => {
  it('janela fixa por chave: passa até o máximo, recusa depois e volta na janela seguinte', () => {
    const t = createThrottle({ windowMs: 1000, max: 2, maxKeys: 10 });
    expect([t.hit('a', 0), t.hit('a', 10), t.hit('a', 20)]).toEqual([true, true, false]);
    expect(t.hit('b', 20)).toBe(true);
    expect(t.hit('a', 1000)).toBe(true);
  });

  it('com muitas chaves, a mais antiga sai: falha aberta, nunca bloqueia quem chega', () => {
    const t = createThrottle({ windowMs: 60_000, max: 1, maxKeys: 2 });
    t.hit('a', 0);
    t.hit('b', 0);
    expect(t.hit('c', 1)).toBe(true);
    // `a` saiu e recomeça a contagem.
    expect(t.hit('a', 2)).toBe(true);
  });

  it('a própria máquina é reconhecida (sem limite fora de produção)', () => {
    expect(['local', '127.0.0.1', '::1'].every(isLoopback)).toBe(true);
    expect(isLoopback('203.0.113.9')).toBe(false);
  });
});

describe('proxy: limite, CSP e no-store (TM-02, TM-03, P7-N1)', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  const request = (path: string, init: { ip: string; headers?: Record<string, string> }) =>
    new NextRequest(`http://localhost${path}`, {
      method: init.headers?.['next-action'] ? 'POST' : 'GET',
      headers: { 'x-real-ip': init.ip, ...init.headers },
    });

  it('o demo recebe 429 acima do limite por IP, com CSP e no-store', () => {
    process.env.CLIENT_IP_HEADER = 'x-real-ip';
    const statuses = Array.from(
      { length: PUBLIC_LIMITS.demo.max + 1 },
      () => proxy(request('/demo', { ip: '203.0.113.50' })).status,
    );
    expect(statuses.slice(0, -1).every((s) => s !== 429)).toBe(true);
    const blocked = proxy(request('/demo/twin', { ip: '203.0.113.50' }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(blocked.headers.get('cache-control')).toBe('private, no-store');
    expect(blocked.headers.get('retry-after')).toBe('60');
    // Outro IP não é afetado.
    expect(proxy(request('/demo', { ip: '203.0.113.51' })).status).not.toBe(429);
  });

  it('action sem sessão tem limite; com cookie de sessão, a guarda é a do servidor', () => {
    process.env.CLIENT_IP_HEADER = 'x-real-ip';
    const action = { 'next-action': 'abc' };
    for (let i = 0; i < PUBLIC_LIMITS.anonymousAction.max; i++) {
      proxy(request('/entrar', { ip: '203.0.113.60', headers: action }));
    }
    expect(proxy(request('/entrar', { ip: '203.0.113.60', headers: action })).status).toBe(429);
    // Cookie qualquer não tira do balde anônimo (revisão M2); com o formato do token, a guarda é a do servidor.
    const fake = request('/inicio', {
      ip: '203.0.113.60',
      headers: { ...action, cookie: '__Host-hm_session=x' },
    });
    expect(proxy(fake).status).toBe(429);
    const withSession = request('/inicio', {
      ip: '203.0.113.60',
      headers: { ...action, cookie: `__Host-hm_session=${'a'.repeat(43)}` },
    });
    expect(proxy(withSession).status).not.toBe(429);
  });

  it('fora de produção, a própria máquina não é limitada', () => {
    process.env.CLIENT_IP_HEADER = 'x-real-ip';
    process.env.APP_ENV = 'test';
    for (let i = 0; i <= PUBLIC_LIMITS.demo.max; i++) proxy(request('/demo', { ip: '127.0.0.1' }));
    expect(proxy(request('/demo', { ip: '127.0.0.1' })).status).not.toBe(429);
  });

  it('prefetch e redirecionamento sem sessão também levam CSP e no-store (P7-N1)', () => {
    const prefetch = proxy(
      request('/demo', { ip: '203.0.113.70', headers: { 'next-router-prefetch': '1', rsc: '1' } }),
    );
    expect(prefetch.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(prefetch.headers.get('cache-control')).toBe('private, no-store');
    const redirect = proxy(request('/inicio', { ip: '203.0.113.70' }));
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get('cache-control')).toBe('private, no-store');
    expect(redirect.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});
