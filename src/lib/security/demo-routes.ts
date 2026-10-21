/**
 * Roteamento do modo só demo (ADR-0043, D3). Só `/demo` e o que está abaixo dele existem:
 * - páginas (GET/HEAD) do app completo, inclusive `/`, `/legal/*`, cadastro, login e área logada: redirecionam
 *   para `/demo`;
 * - route handlers e server actions fora de `/demo`: 404. As actions do app completo também respondem 404
 *   dentro de `/demo` pela guarda `assertFullApp` (o ID de uma action vale em qualquer caminho);
 * - qualquer outro método fora de `/demo`: 404.
 * Função pura, sem runtime do Next: testada rota a rota.
 */
export type DemoOnlyDecision =
  { kind: 'pass' } | { kind: 'redirect'; to: '/demo' } | { kind: 'notFound' };

/** Route handlers do app completo (e o prefixo reservado `/api`). */
const ROUTE_HANDLERS = [/^\/privacidade\/exportacoes\/[^/]+\/?$/, /^\/api(\/|$)/];

export function isDemoPath(pathname: string): boolean {
  return pathname === '/demo' || pathname.startsWith('/demo/');
}

export function demoOnlyRoute(
  pathname: string,
  method: string,
  headers: Headers,
): DemoOnlyDecision {
  if (ROUTE_HANDLERS.some((re) => re.test(pathname))) return { kind: 'notFound' };
  if (isDemoPath(pathname)) return { kind: 'pass' };
  if (headers.has('next-action')) return { kind: 'notFound' };
  if (method === 'GET' || method === 'HEAD') return { kind: 'redirect', to: '/demo' };
  return { kind: 'notFound' };
}
