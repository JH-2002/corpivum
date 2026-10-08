import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ModulePage, type PageKey } from '@/components/shell/ModulePage';
import { buttonClasses } from '@/components/ui/Button';
import { StateView, type ViewState } from '@/components/ui/StateView';
import type { AppSession } from '@/modules/consent/server';
import type { HealthDataSource } from '@/modules/health/source';
import { createDemoSourceFor, createOwnSource } from '@/modules/health/server';
import { DemoModeBanner } from './DemoModeBanner';

export type HealthMode = 'own' | 'appDemo' | 'publicDemo';

export type HealthView =
  { kind: 'consent' } | { kind: 'data'; source: HealthDataSource; mode: HealthMode };

/**
 * De onde vêm os dados de uma tela de saúde da área logada (ADR-0021):
 * - modo demo: gerador em memória (nada da pessoa é lido; não depende de consentimento);
 * - dados próprios: só com consentimento ativo; sem ele, a tela explica como autorizar (LEG-C04).
 */
export function healthView(session: AppSession, today: string): HealthView {
  if (session.dataMode === 'demo') {
    return { kind: 'data', source: createDemoSourceFor(today), mode: 'appDemo' };
  }
  if (session.health.status !== 'active') return { kind: 'consent' };
  return { kind: 'data', source: createOwnSource(session.userId), mode: 'own' };
}

/** Moldura das telas de saúde: aviso de consentimento, estado forçado (revisão) e faixa do modo demo. */
export function HealthFrame({
  page,
  href,
  session,
  view,
  preview,
  children,
}: {
  page: PageKey;
  href: Route;
  session: AppSession;
  view: HealthView;
  preview: ViewState | null;
  children: ReactNode;
}) {
  const t = useTranslations('common');
  if (view.kind === 'consent') {
    return <ModulePage page={page} href={href} state="empty" healthConsent={session.health} />;
  }
  return (
    <div className="flex flex-col gap-6">
      {view.mode === 'appDemo' ? <DemoModeBanner /> : null}
      {preview ? (
        <StateView
          state={preview}
          action={
            preview === 'error' ? (
              <Link href={href} className={buttonClasses('secondary')}>
                {t('retry')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        children
      )}
    </div>
  );
}
