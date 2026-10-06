import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { StateView, VIEW_STATES, type ViewState } from '@/components/ui/StateView';

type PageKey =
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

interface ModulePageProps {
  page: PageKey;
  href: Route;
  state: ViewState;
  /** Ação do estado vazio (ex.: abrir o registro rápido). */
  emptyAction?: ReactNode;
  /** Conteúdo extra abaixo do estado (ex.: seletor de tema em Configurações). */
  children?: ReactNode;
}

/** Página de módulo ainda sem dados: mostra o estado pedido com os textos do módulo. */
export function ModulePage({ page, href, state, emptyAction, children }: ModulePageProps) {
  const t = useTranslations(`pages.${page}`);
  const tStates = useTranslations('common');

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
