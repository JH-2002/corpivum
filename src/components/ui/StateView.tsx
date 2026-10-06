import { AlertTriangle, CircleDashed, Info, Sprout } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/** Estados obrigatórios de toda tela (§34, Definition of Done). */
export const VIEW_STATES = ['loading', 'empty', 'error', 'no-data', 'partial'] as const;
export type ViewState = (typeof VIEW_STATES)[number];

export interface StateViewProps {
  state: ViewState;
  /** Título e descrição do estado vazio (específicos de cada página). */
  emptyTitle?: string;
  emptyDescription?: string;
  /** Ação principal (ex.: link para registrar ou "tentar novamente"). */
  action?: ReactNode;
  /** Conteúdo exibido abaixo do aviso no estado de dados parciais. */
  children?: ReactNode;
}

function Panel({
  icon,
  title,
  description,
  action,
  role,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  role?: 'alert' | 'status';
}) {
  return (
    <section
      role={role}
      className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-10 text-center shadow-sm"
    >
      <span className="text-primary" aria-hidden="true">
        {icon}
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}

export function StateView({
  state,
  emptyTitle,
  emptyDescription,
  action,
  children,
}: StateViewProps) {
  const t = useTranslations('states');

  switch (state) {
    case 'loading':
      return (
        <div role="status" aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">{t('loading')}</span>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-24 animate-pulse rounded-lg bg-surface-muted"
            />
          ))}
        </div>
      );
    case 'empty':
      return (
        <Panel
          icon={<Sprout className="size-10" />}
          title={emptyTitle ?? t('noDataTitle')}
          description={emptyDescription}
          action={action}
        />
      );
    case 'error':
      return (
        <Panel
          role="alert"
          icon={<AlertTriangle className="size-10 text-danger" />}
          title={t('errorTitle')}
          description={t('errorDescription')}
          action={action}
        />
      );
    case 'no-data':
      return (
        <Panel
          role="status"
          icon={<CircleDashed className="size-10" />}
          title={t('noDataTitle')}
          description={t('noDataDescription')}
          action={action}
        />
      );
    case 'partial':
      return (
        <div className="flex flex-col gap-4">
          <div
            role="status"
            className="flex items-start gap-3 rounded-md border border-warning bg-warning-soft p-4 text-sm"
          >
            <Info className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <p>
              <strong className="font-semibold">{t('partialTitle')}.</strong>{' '}
              {t('partialDescription')}
            </p>
          </div>
          {children}
        </div>
      );
  }
}
