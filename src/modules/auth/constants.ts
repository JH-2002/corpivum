/** Constantes sem dependência de runtime: usadas pelo proxy, pelo servidor e por componentes cliente. */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const RECOVERY_CODE_COUNT = 10;

/** Cookie da sessão (`__Host-`: Secure, Path=/, sem Domain). LEG-S04. */
export const SESSION_COOKIE = '__Host-hm_session';

/** Rotas acessíveis sem sessão. */
export const PUBLIC_PATH_PREFIXES = [
  '/entrar',
  '/cadastro',
  '/verificar-email',
  '/recuperar-senha',
  '/redefinir-senha',
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
