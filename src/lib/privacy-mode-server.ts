import 'server-only';
import { cookies } from 'next/headers';
import { parsePrivacyMode, PRIVACY_MODE_COOKIE } from './privacy-mode';

/** Estado do modo privacidade nesta requisição (ADR-0035). */
export async function readPrivacyMode(): Promise<boolean> {
  return parsePrivacyMode((await cookies()).get(PRIVACY_MODE_COOKIE)?.value);
}

/**
 * Grava a escolha. Cookie de sessão (some ao fechar o navegador, como o período, ADR-0021), HttpOnly, sem
 * identificador: só a preferência de interface.
 */
export async function writePrivacyMode(on: boolean): Promise<void> {
  (await cookies()).set(PRIVACY_MODE_COOKIE, on ? 'on' : 'off', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
}
