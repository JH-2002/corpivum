import 'server-only';
import { cookies } from 'next/headers';
import { PRESENTING_MAX_AGE_MS, presentingValid } from './presentation';
import { writePrivacyMode } from './privacy-mode-server';

/**
 * Modo apresentação (§45, ADR-0035). Ao entrar, o modo privacidade é SEMPRE ligado e este cookie de sessão
 * (`on.<instante de expiração>`, sem identificador) marca a apresentação em curso. É de sessão, como o do modo
 * privacidade: reabrir o navegador nunca pula a tela de entrada com o modo desligado (revisão M1 do OI-36 d). Ao sair, o modo privacidade CONTINUA ligado (OI-36 d,
 * decisão do produto de 2026-10-15): a tela de destino avisa e oferece desligar, para os valores reais não
 * aparecerem na frente de quem assistia. A marca vale no máximo 4 h e some se o modo privacidade mudar fora do
 * deck: uma apresentação abandonada (voltar do navegador) não deixa a próxima entrada pular a tela de entrada
 * (revisão M1).
 */
export const PRESENTING_COOKIE = '__Host-hm_presenting';

const OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const;
export async function isPresenting(): Promise<boolean> {
  return presentingValid((await cookies()).get(PRESENTING_COOKIE)?.value);
}

export async function enterPresentation(): Promise<void> {
  (await cookies()).set(PRESENTING_COOKIE, `on.${Date.now() + PRESENTING_MAX_AGE_MS}`, OPTIONS);
  await writePrivacyMode(true);
}

export async function exitPresentation(): Promise<void> {
  await writePrivacyMode(true);
  await leavePresentationState();
}

/** Esquece a apresentação em curso (sem mexer no modo privacidade). */
export async function leavePresentationState(): Promise<void> {
  const store = await cookies();
  if (store.has(PRESENTING_COOKIE)) store.set(PRESENTING_COOKIE, '', { ...OPTIONS, maxAge: 0 });
}
