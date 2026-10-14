import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, createNonce } from '@/lib/security/csp';
import { isPublicPath, SESSION_COOKIE } from '@/modules/auth/constants';
import { BODY_ASSETS } from '@/modules/twin/bodyAssets';

/** WebAssembly (meshopt) só quando existe modelo 3D para decodificar (ADR-0028). */
const HAS_3D_MODELS = Object.keys(BODY_ASSETS).length > 0;

/**
 * Proxy (Next 16): CSP com nonce por requisição (LEG-S05) e redirecionamento "barato" para /entrar quando
 * não há cookie de sessão. A validação REAL da sessão acontece no servidor, no banco, a cada requisição
 * (`requireSession`, LEG-S04): o proxy só olha a presença do cookie.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV === 'development',
    https: process.env.APP_ENV === 'production',
    wasm: HAS_3D_MODELS,
  });

  const { pathname } = request.nextUrl;
  if (!isPublicPath(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    url.search = '';
    const res = NextResponse.redirect(url);
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // O Next lê a CSP do cabeçalho da requisição para aplicar o nonce aos próprios scripts.
  requestHeaders.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  // Páginas com dados de conta nunca vão para cache compartilhado.
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

// Só `models/<nome>.<hash>.glb`: modelos 3D estáticos, sem dado pessoal (ADR-0028). Ficam fora do proxy para
// o demo público carregá-los sem sessão e o cache imutável não virar `no-store`. Qualquer outro caminho em
// `/models/` (404, arquivo de outro tipo) passa pelo proxy e recebe CSP.
export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|models/[a-z0-9-]+\\.[0-9a-f]+\\.glb$|favicon.ico|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
