import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, createNonce } from '@/lib/security/csp';
import { createThrottle, isLoopback, PUBLIC_LIMITS } from '@/lib/security/public-throttle';
import { clientIp } from '@/modules/auth/client-ip';
import { isPublicPath, SESSION_COOKIE } from '@/modules/auth/constants';
import { BODY_ASSETS } from '@/modules/twin/bodyAssets';

/** WebAssembly (meshopt) só quando existe modelo 3D para decodificar (ADR-0028). */
const HAS_3D_MODELS = Object.keys(BODY_ASSETS).length > 0;

/**
 * Rotas removidas na reorientação (ADR-0027) e com o fim da IA (ADR-0030): links salvos levam à tela inicial
 * em vez de um 404. Aqui, e não no `next.config`, para o redirecionamento levar CSP e os cabeçalhos de
 * segurança (TM-02). Temporário (307): o navegador não guarda o redirecionamento.
 */
const REMOVED_ROUTES: Readonly<Record<string, string>> = {
  '/humor': '/inicio',
  '/diario': '/inicio',
  '/medicamentos': '/inicio',
  '/ia': '/inicio',
  '/twin/cerebro': '/twin',
  '/demo/humor': '/demo',
  '/demo/diario': '/demo',
  '/demo/twin/cerebro': '/demo/twin',
};

const SESSION_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const demoThrottle = createThrottle(PUBLIC_LIMITS.demo);
const actionThrottle = createThrottle(PUBLIC_LIMITS.anonymousAction);

/**
 * TM-03: o demo e as server actions sem cookie de sessão têm limite por IP (em memória). Fora de produção,
 * a própria máquina não é limitada (e2e e desenvolvimento).
 */
function overPublicLimit(request: NextRequest): boolean {
  const isDemo =
    request.nextUrl.pathname === '/demo' || request.nextUrl.pathname.startsWith('/demo/');
  // Só um cookie com o formato do token tira a action do balde anônimo (revisão M2 da 7b): um cookie qualquer
  // não basta. A sessão em si é conferida no servidor.
  const sessionLike = SESSION_TOKEN_SHAPE.test(request.cookies.get(SESSION_COOKIE)?.value ?? '');
  const isAnonymousAction =
    request.method === 'POST' && request.headers.has('next-action') && !sessionLike;
  if (!isDemo && !isAnonymousAction) return false;
  const ip = clientIp(request.headers, process.env.CLIENT_IP_HEADER);
  if (process.env.APP_ENV !== 'production' && isLoopback(ip)) return false;
  const now = Date.now();
  // As duas contagens são independentes: uma action do demo conta nas duas.
  const demoOk = !isDemo || demoThrottle.hit(ip, now);
  const actionOk = !isAnonymousAction || actionThrottle.hit(ip, now);
  return !demoOk || !actionOk;
}

/**
 * Proxy (Next 16): CSP com nonce por requisição (LEG-S05), `no-store` em toda resposta que passa por aqui,
 * limite por IP do que é público (TM-03) e redirecionamento "barato" para /entrar quando não há cookie de
 * sessão. A validação REAL da sessão acontece no servidor, no banco, a cada requisição (`requireSession`,
 * LEG-S04): o proxy só olha a presença do cookie. Prefetches também passam por aqui (P7-N1): recebem CSP e
 * `no-store` como qualquer outra resposta.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV === 'development',
    https: process.env.APP_ENV === 'production',
    wasm: HAS_3D_MODELS,
  });

  if (overPublicLimit(request)) {
    return new NextResponse(null, {
      status: 429,
      headers: {
        'Content-Security-Policy': csp,
        'Cache-Control': 'private, no-store',
        'Retry-After': '60',
      },
    });
  }

  const { pathname } = request.nextUrl;
  const removedTo = REMOVED_ROUTES[pathname.replace(/\/$/, '')];
  const toLogin = !isPublicPath(pathname) && !request.cookies.has(SESSION_COOKIE);
  if (removedTo || toLogin) {
    const url = request.nextUrl.clone();
    url.pathname = removedTo ?? '/entrar';
    url.search = '';
    const res = NextResponse.redirect(url);
    res.headers.set('Content-Security-Policy', csp);
    res.headers.set('Cache-Control', 'private, no-store');
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
// `/models/` (404, arquivo de outro tipo) passa pelo proxy e recebe CSP. Sem exceção para prefetch (P7-N1).
export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|models/[a-z0-9-]+\\.[0-9a-f]+\\.glb$|favicon.ico|robots.txt).*)',
    },
  ],
};
