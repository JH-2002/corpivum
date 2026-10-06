/**
 * Content-Security-Policy com nonce por requisição (LEG-S05). Sem origens de terceiros: o app não carrega
 * fontes, scripts, imagens ou conexões externas (ADR-0005; QR do TOTP é gerado localmente, ADR-0014).
 * `style-src 'unsafe-inline'`: estilos inline do React/Next; não executam código.
 */
export function buildCsp(nonce: string, opts: { dev: boolean; https?: boolean }): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'unsafe-eval' só em desenvolvimento (React Refresh/Turbopack).
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(opts.dev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...(opts.dev ? ['ws:'] : [])],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'frame-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  // Só em produção (https): em http://localhost a CI roda o build de produção.
  if (opts.https) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

/** Nonce de 128 bits em base64 (Web Crypto: roda no runtime do proxy). */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
