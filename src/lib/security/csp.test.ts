// @vitest-environment node
import { buildCsp, createNonce } from './csp';
import { isPublicPath } from '@/modules/auth/constants';

describe('CSP (LEG-S05)', () => {
  const prod = buildCsp('abc123', { dev: false, https: true });

  it('usa nonce e strict-dynamic; sem unsafe-inline/eval em script-src em produção', () => {
    const script = prod.split('; ').find((d) => d.startsWith('script-src')) ?? '';
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain('unsafe-inline');
    expect(script).not.toContain('unsafe-eval');
  });

  it('bloqueia frames, objetos, base e envio de formulário para fora', () => {
    for (const d of [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ]) {
      expect(prod).toContain(d);
    }
  });

  it('nenhuma origem de terceiros (QR e fontes são locais)', () => {
    expect(prod).not.toMatch(/https?:\/\//);
    expect(prod).toContain("img-src 'self' data: blob:");
    expect(prod).toContain("connect-src 'self'");
  });

  it('upgrade-insecure-requests só com https', () => {
    expect(buildCsp('n', { dev: false })).not.toContain('upgrade-insecure-requests');
  });

  it('unsafe-eval só em desenvolvimento', () => {
    expect(buildCsp('n', { dev: true })).toContain("'unsafe-eval'");
  });

  it('nonce aleatório de 128 bits', () => {
    const a = createNonce();
    expect(Buffer.from(a, 'base64')).toHaveLength(16);
    expect(createNonce()).not.toBe(a);
  });
});

describe('rotas públicas', () => {
  it('só as telas de conta são públicas', () => {
    expect(isPublicPath('/entrar')).toBe(true);
    expect(isPublicPath('/entrar/verificacao')).toBe(true);
    expect(isPublicPath('/cadastro/conta')).toBe(true);
    expect(isPublicPath('/inicio')).toBe(false);
    expect(isPublicPath('/entrarx')).toBe(false);
    expect(isPublicPath('/configuracoes/seguranca')).toBe(false);
  });
});
