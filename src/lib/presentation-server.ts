import 'server-only';
import { cookies } from 'next/headers';
import { readPrivacyMode, writePrivacyMode } from './privacy-mode-server';

/**
 * Modo apresentação (§45, ADR-0035). Ao entrar, o modo privacidade é SEMPRE ligado; o estado anterior fica
 * neste cookie (`on`/`off`, sem identificador) e volta ao sair. O cookie vale no máximo 4 h e some se o modo
 * privacidade mudar fora do deck: uma apresentação abandonada (voltar do navegador) não deixa a próxima
 * entrada pular a tela de entrada nem restaurar uma escolha velha (revisão M1).
 */
export const PRESENTING_COOKIE = '__Host-hm_presenting';

const OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const;
const MAX_AGE_S = 4 * 60 * 60;

export async function isPresenting(): Promise<boolean> {
  const value = (await cookies()).get(PRESENTING_COOKIE)?.value;
  return value === 'on' || value === 'off';
}

export async function enterPresentation(): Promise<void> {
  // Entrar de novo (outra aba, recarregar) não perde o estado de antes da primeira entrada.
  if (!(await isPresenting())) {
    (await cookies()).set(PRESENTING_COOKIE, (await readPrivacyMode()) ? 'on' : 'off', {
      ...OPTIONS,
      maxAge: MAX_AGE_S,
    });
  }
  await writePrivacyMode(true);
}

export async function exitPresentation(): Promise<void> {
  const store = await cookies();
  const previous = store.get(PRESENTING_COOKIE)?.value;
  // Sem registro do estado anterior, fica ligado (o lado mais protegido).
  await writePrivacyMode(previous !== 'off');
  await leavePresentationState();
}

/** Esquece a apresentação em curso (sem mexer no modo privacidade). */
export async function leavePresentationState(): Promise<void> {
  const store = await cookies();
  if (store.has(PRESENTING_COOKIE)) store.set(PRESENTING_COOKIE, '', { ...OPTIONS, maxAge: 0 });
}
