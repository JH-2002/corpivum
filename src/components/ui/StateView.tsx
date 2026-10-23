import { AlertTriangle, ArrowRight, CircleDashed, Info, Sprout } from 'lucide-react';
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
  /** O que fazer a seguir (9d), em texto: "Próximo passo: …". Vale para vazio, sem dados e parcial. */
  nextStep?: string;
  /** Conteúdo exibido abaixo do aviso no estado de dados parciais. */
  children?: ReactNode;
}

/** "Próximo passo: …" com rótulo em texto (a seta é só apoio visual). */
function NextStep({ text }: { text: string }) {
  const t = useTranslations('states');
  return (
    <p className="flex items-start gap-2 text-sm">
      <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>
        <strong className="font-semibold">{t('nextStepLabel')}</strong> {text}
      </span>
    </p>
  );
}

function Panel({
  icon,
  title,
  description,
  nextStep,
  action,
  role,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  nextStep?: string;
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
      {nextStep ? <NextStep text={nextStep} /> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}

export function StateView({
  state,
  emptyTitle,
  emptyDescription,
  action,
  nextStep,
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
          nextStep={nextStep}
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
          nextStep={nextStep}
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
            <div className="flex flex-col gap-2">
              <p>
                <strong className="font-semibold">{t('partialTitle')}.</strong>{' '}
                {t('partialDescription')}
              </p>
              {nextStep ? <NextStep text={nextStep} /> : null}
            </div>
          </div>
          {children}
        </div>
      );
  }
}
