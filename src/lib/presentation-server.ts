import 'server-only';
import { cookies } from 'next/headers';
import { readPrivacyMode, writePrivacyMode } from './privacy-mode-server';

/**
 * Modo apresentação (§45, ADR-0035). Ao entrar, o modo privacidade é SEMPRE ligado; o estado anterior fica
 * neste cookie de sessão (`on`/`off`, sem identificador) e volta ao sair. Se a pessoa fechar o navegador no
 * meio, os dois cookies de sessão somem juntos.
 */
export const PRESENTING_COOKIE = '__Host-hm_presenting';

const OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const;

export async function isPresenting(): Promise<boolean> {
  const value = (await cookies()).get(PRESENTING_COOKIE)?.value;
  return value === 'on' || value === 'off';
}

export async function enterPresentation(): Promise<void> {
  // Entrar de novo (outra aba, recarregar) não perde o estado de antes da primeira entrada.
  if (!(await isPresenting())) {
    (await cookies()).set(PRESENTING_COOKIE, (await readPrivacyMode()) ? 'on' : 'off', OPTIONS);
  }
  await writePrivacyMode(true);
}

export async function exitPresentation(): Promise<void> {
  const store = await cookies();
  const previous = store.get(PRESENTING_COOKIE)?.value;
  // Sem registro do estado anterior, fica ligado (o lado mais protegido).
  await writePrivacyMode(previous !== 'off');
  store.set(PRESENTING_COOKIE, '', { ...OPTIONS, maxAge: 0 });
}
