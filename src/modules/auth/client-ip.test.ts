// @vitest-environment node
import { clientIp } from './client-ip';

describe('clientIp (LEG-S05)', () => {
  it('sem cabeçalho confiável usa o ÚLTIMO salto de X-Forwarded-For (o primeiro é do cliente)', () => {
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' });
    expect(clientIp(h)).toBe('203.0.113.9');
  });

  it('com cabeçalho confiável ignora X-Forwarded-For forjado', () => {
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '198.51.100.7' });
    expect(clientIp(h, 'x-real-ip')).toBe('198.51.100.7');
  });

  it('sem nenhum valor: local em dev, unknown com cabeçalho configurado ausente', () => {
    expect(clientIp(new Headers())).toBe('local');
    expect(clientIp(new Headers(), 'x-real-ip')).toBe('unknown');
  });
});
