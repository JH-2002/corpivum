import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getAdapters } from '@/adapters';
import { getDb } from '@/lib/db/client';
import type { Tx } from '@/lib/db/rls';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { ResolvedSession } from '@/modules/auth';
import { requireVerifiedSession } from '@/modules/auth/server';
import type { ConsentPurpose } from './catalog';
import { withConsentOn } from './guard';
import type { HealthConsentState } from './health';
import { createConsentService, type ConsentService, type ConsentState } from './service';

/** Integração do consentimento com o Next: serviço, guarda de página e guard de tratamento. */
let service: ConsentService | undefined;

export function getConsentService(): ConsentService {
  if (!service) {
    service = createConsentService({
      db: getDb(),
      jobs: getAdapters().jobs,
      logger,
      healthDataGraceDays: getEnv().HEALTH_DATA_GRACE_DAYS,
    });
  }
  return service;
}

/** Estado de consentimento da pessoa, lido uma vez por requisição. */
export const getConsentState = cache((userId: string): Promise<ConsentState> =>
  getConsentService().getState(userId),
);

export interface AppSession extends ResolvedSession {
  health: HealthConsentState;
}

/**
 * Guarda de toda página da área logada (substitui `requireVerifiedSession` em `(app)`):
 * sessão válida e e-mail verificado (LEG-S04), onboarding concluído (§52) e nenhuma versão substancial
 * pendente (LEG-C06). `allowPendingUpdate`: a Central de Privacidade continua acessível durante o
 * reconsentimento (revogar e encerrar conta nunca podem ficar presos atrás de um aceite).
 */
export async function requireAppSession(
  options: { allowPendingUpdate?: boolean } = {},
): Promise<AppSession> {
  const session = await requireVerifiedSession();
  const state = await getConsentState(session.userId);
  if (!state.onboardingCompleted) redirect('/boas-vindas/seguranca');
  if (state.updatePending && !options.allowPendingUpdate) redirect('/boas-vindas/atualizacao');
  return { ...session, health: state.health };
}

/**
 * Guarda das telas de onboarding: sessão verificada, ainda sem onboarding concluído.
 * Quem já concluiu vai para o início.
 */
export async function requireOnboardingSession(): Promise<ResolvedSession> {
  const session = await requireVerifiedSession();
  const state = await getConsentState(session.userId);
  if (state.onboardingCompleted) redirect('/inicio');
  return session;
}

/** Guarda da tela de atualização: só com algo pendente (LEG-C06). */
export async function requireUpdateSession(): Promise<{
  session: ResolvedSession;
  state: ConsentState;
}> {
  const session = await requireVerifiedSession();
  const state = await getConsentState(session.userId);
  if (!state.onboardingCompleted) redirect('/boas-vindas/seguranca');
  if (!state.updatePending) redirect('/inicio');
  return { session, state };
}

/**
 * Guard de tratamento (CLAUDE.md regra 1): roda `fn` só com consentimento ativo para a finalidade, na
 * mesma transação. Sem consentimento: `ConsentRequiredError`.
 */
export function withConsent<T>(
  userId: string,
  purpose: ConsentPurpose,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withConsentOn(getDb(), userId, purpose, fn);
}
