import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { cache } from 'react';
import { getAdapters } from '@/adapters';
import { getDb } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { clientIp } from './client-ip';
import { SESSION_COOKIE } from './constants';
import { AGE_BLOCK_COOKIE, AGE_OK_COOKIE, AGE_OK_TTL_SECONDS } from './age';
import { KNOWN_DEVICE_COOKIE, KNOWN_DEVICE_MAX_AGE_S } from './known-device';
import {
  createAuthService,
  SESSION_ABSOLUTE_MS,
  type AuthService,
  type RequestMeta,
  type ResolvedSession,
} from './service';

/** Integração do serviço de auth com o Next (cookies, cabeçalhos, redirecionamentos). LEG-S04. */
const PENDING_MFA_MAX_AGE_S = 10 * 60;

let service: AuthService | undefined;

export function getAuthService(): AuthService {
  if (!service) {
    const env = getEnv();
    const adapters = getAdapters();
    service = createAuthService({
      db: getDb(),
      kms: adapters.kms,
      mail: adapters.mail,
      ageSignal: adapters.ageSignal,
      logger,
      sessionSecret: Buffer.from(env.SESSION_SECRET, 'base64'),
      rateLimitSecret: Buffer.from(env.RATE_LIMIT_SECRET, 'base64'),
      appUrl: env.APP_URL,
      // Token + e-mail depois da resposta: tempo igual com ou sem conta (anti-enumeração).
      defer: (task) => after(task),
    });
  }
  return service;
}

/**
 * IP (chave HMAC dos limites e registro de acesso, LEG-R02), user-agent (só para o rótulo do aparelho) e
 * cookie de aparelho conhecido (OI-15).
 */
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const knownDevice = (await cookies()).get(KNOWN_DEVICE_COOKIE)?.value;
  return {
    ip: clientIp(h, getEnv().CLIENT_IP_HEADER),
    userAgent: h.get('user-agent'),
    ...(knownDevice ? { knownDevice } : {}),
  };
}

/** Cookie de aparelho conhecido (OI-15): assinado, sem identificador da conta. */
export async function setKnownDeviceCookie(value: string): Promise<void> {
  (await cookies()).set(KNOWN_DEVICE_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: KNOWN_DEVICE_MAX_AGE_S,
  });
}

export async function setSessionCookie(token: string, mfaPending: boolean): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: mfaPending ? PENDING_MFA_MAX_AGE_S : SESSION_ABSOLUTE_MS / 1000,
  });
}

/**
 * Apaga o cookie de sessão. `cookies().delete()` emite Set-Cookie sem `Secure`, que o navegador rejeita para
 * cookies `__Host-`; por isso sobrescrevemos com os mesmos atributos e maxAge 0.
 */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Sessão da requisição, validada no banco (uma vez por requisição). */
export const getCurrentSession = cache(async (): Promise<ResolvedSession | null> => {
  return getAuthService().resolveSession(await readSessionToken(), await requestMeta());
});

/** Exige sessão completa (com 2º fator, se houver). */
export async function requireSession(): Promise<ResolvedSession> {
  const session = await getCurrentSession();
  if (!session) redirect('/entrar');
  if (session.mfaPending) redirect('/entrar/verificacao');
  return session;
}

/** Exige sessão completa e e-mail verificado: guarda da área logada. */
export async function requireVerifiedSession(): Promise<ResolvedSession> {
  const session = await requireSession();
  if (!session.emailVerified) redirect('/verificar-email');
  return session;
}

/** Cookie de bloqueio do age gate: sessão do navegador, sem identificador, nunca em banco (LEG-F01). */
export async function setAgeBlockCookie(): Promise<void> {
  (await cookies()).set(AGE_BLOCK_COOKIE, '1', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/cadastro',
  });
}

export async function hasAgeBlockCookie(): Promise<boolean> {
  return (await cookies()).get(AGE_BLOCK_COOKIE)?.value === '1';
}

export async function setAgeOkCookie(value: string): Promise<void> {
  (await cookies()).set(AGE_OK_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/cadastro',
    maxAge: AGE_OK_TTL_SECONDS,
  });
}

export async function readAgeOkCookie(): Promise<string | undefined> {
  return (await cookies()).get(AGE_OK_COOKIE)?.value;
}

export async function clearAgeOkCookie(): Promise<void> {
  (await cookies()).set(AGE_OK_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/cadastro',
    maxAge: 0,
  });
}
