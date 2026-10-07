import { ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { StateView, VIEW_STATES, type ViewState } from '@/components/ui/StateView';
import type { HealthConsentState } from '@/modules/consent';

export type PageKey =
  | 'home'
  | 'sleep'
  | 'mood'
  | 'habits'
  | 'journal'
  | 'body'
  | 'nutrition'
  | 'activity'
  | 'medications'
  | 'goals'
  | 'timeline'
  | 'twin'
  | 'ai'
  | 'reports'
  | 'settings'
  | 'privacy';

export type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Pré-visualização de estados por `?state=loading|error|no-data|partial`, para revisão visual e
 * testes e2e. Só em APP_ENV=development|test.
 */
export async function resolvePreviewState(searchParams: PageSearchParams): Promise<ViewState> {
  // Falha fechada: só liga com APP_ENV explicitamente de desenvolvimento ou teste.
  const appEnv = process.env.APP_ENV;
  if (appEnv !== 'development' && appEnv !== 'test') return 'empty';
  const { state } = await searchParams;
  return VIEW_STATES.find((s) => s === state) ?? 'empty';
}

/**
 * Igual a `resolvePreviewState`, mas `null` quando nenhum estado foi pedido: as telas com dados reais
 * mostram o conteúdo e só trocam pelo estado forçado em revisão/e2e (APP_ENV=development|test).
 */
export async function readPreviewState(searchParams: PageSearchParams): Promise<ViewState | null> {
  const appEnv = process.env.APP_ENV;
  if (appEnv !== 'development' && appEnv !== 'test') return null;
  const { state } = await searchParams;
  return VIEW_STATES.find((s) => s === state) ?? null;
}

interface ModulePageProps {
  page: PageKey;
  href: Route;
  state: ViewState;
  /** Ação do estado vazio (ex.: abrir o registro rápido). */
  emptyAction?: ReactNode;
  /** Conteúdo extra abaixo do estado (ex.: seletor de tema em Configurações). */
  children?: ReactNode;
  /**
   * Módulos com dados de bem-estar: sem consentimento ativo, nada é exibido nem processado (CLAUDE.md
   * regra 1, LEG-C04) e a tela explica como autorizar.
   */
  healthConsent?: HealthConsentState;
}

/** Aviso no lugar do conteúdo quando o consentimento de dados de bem-estar não está ativo. */
function HealthConsentNotice({
  consent,
}: {
  consent: Exclude<HealthConsentState, { status: 'active' }>;
}) {
  const t = useTranslations('consent');
  const format = useFormatter();
  const revoked = consent.status === 'revoked';
  return (
    <section
      role="status"
      className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-10 text-center shadow-sm"
    >
      <ShieldOff className="size-10 text-primary" aria-hidden="true" />
      <h2 className="text-lg font-semibold">
        {revoked ? t('healthRevoked.title') : t('healthMissing.title')}
      </h2>
      <p className="text-sm text-fg-muted">
        {revoked
          ? t('healthRevoked.body', {
              date: format.dateTime(consent.purgeAt, { dateStyle: 'long' }),
            })
          : t('healthMissing.body')}
      </p>
      <Link href="/privacidade#autorizacoes" className={buttonClasses('primary', 'mt-2')}>
        {revoked ? t('healthRevoked.action') : t('healthMissing.action')}
      </Link>
    </section>
  );
}

/** Página de módulo ainda sem dados: mostra o estado pedido com os textos do módulo. */
export function ModulePage({
  page,
  href,
  state,
  emptyAction,
  children,
  healthConsent,
}: ModulePageProps) {
  const t = useTranslations(`pages.${page}`);
  const tStates = useTranslations('common');

  if (healthConsent && healthConsent.status !== 'active') {
    return (
      <div className="flex flex-col gap-6">
        <HealthConsentNotice consent={healthConsent} />
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <StateView
        state={state}
        emptyTitle={t('emptyTitle')}
        emptyDescription={t('emptyDescription')}
        action={
          state === 'error' ? (
            <Link href={href} className={buttonClasses('secondary')}>
              {tStates('retry')}
            </Link>
          ) : state === 'empty' ? (
            emptyAction
          ) : undefined
        }
      />
      {children}
    </div>
  );
}
