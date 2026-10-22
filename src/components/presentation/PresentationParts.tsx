import { Presentation } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { enterPresentationAction } from '@/app/presentation-actions';
import { DemoOnlyBanner } from '@/components/demo/DemoOnlyBanner';
import { buttonClasses } from '@/components/ui/Button';
import { MAIN_CONTENT_ID } from '@/components/ui/SkipLink';
import { TiltCard } from '@/components/ui/TiltCard';
import { cn } from '@/lib/cn';
import { presentationHref, type PresentationScreen } from './screens';

/**
 * Entrada do modo apresentação (ADR-0035): quem abre o endereço direto ainda não "entrou". O botão grava a
 * entrada (modo privacidade ligado) antes de mostrar qualquer dado.
 */
export function PresentationStart({ scope }: { scope: 'app' | 'demo' }) {
  const t = useTranslations('presentation');
  return (
    <div className="flex min-h-dvh flex-col">
      {scope === 'demo' ? (
        <div className="sticky top-0 z-20">
          <DemoOnlyBanner />
        </div>
      ) : null}
      <main
        id={MAIN_CONTENT_ID}
        className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10"
      >
        <TiltCard className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p>{t('startBody')}</p>
          <p className="text-sm text-fg-muted">{t('startPrivacy')}</p>
          <div className="flex flex-wrap gap-3">
            <form action={enterPresentationAction}>
              <input type="hidden" name="scope" value={scope} />
              <button type="submit" className={buttonClasses('primary')}>
                <Presentation className="size-4" aria-hidden="true" />
                {t('start')}
              </button>
            </form>
            <Link
              href={scope === 'app' ? '/inicio' : '/demo'}
              className={buttonClasses('secondary')}
            >
              {t('back')}
            </Link>
          </div>
        </TiltCard>
      </main>
    </div>
  );
}

/** Botão que entra no modo apresentação (menu de ajuda). */
export function EnterPresentationForm({
  scope,
  className,
}: {
  scope: 'app' | 'demo';
  className?: string;
}) {
  const t = useTranslations('presentation');
  return (
    <form action={enterPresentationAction}>
      <input type="hidden" name="scope" value={scope} />
      <button type="submit" className={className}>
        <Presentation className="size-4" aria-hidden="true" />
        {t('enter')}
      </button>
    </form>
  );
}

/**
 * Demonstração (padrão) ou "meus dados" na apresentação da conta (§45). Meus dados só com o consentimento
 * de dados de bem-estar ativo e a conta no modo de dados próprios; sem isso, o texto explica e a opção
 * não aparece como link.
 */
export function PresentationDataSwitch({
  screen,
  own,
  ownAvailable,
}: {
  screen: PresentationScreen;
  own: boolean;
  ownAvailable: boolean;
}) {
  const t = useTranslations('presentation.data');
  const option = (active: boolean) =>
    cn(
      'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold',
      active ? 'border-primary bg-primary-soft text-fg' : 'border-border-strong bg-surface',
    );
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span id="presentation-data" className="font-semibold">
        {t('label')}
      </span>
      <ul aria-labelledby="presentation-data" className="flex flex-wrap gap-2">
        <li>
          <Link
            href={presentationHref('/apresentacao', screen, false) as Route}
            aria-current={own ? undefined : 'true'}
            className={option(!own)}
          >
            {!own ? <span aria-hidden="true">✓ </span> : null}
            {t('demo')}
          </Link>
        </li>
        {ownAvailable ? (
          <li>
            <Link
              href={presentationHref('/apresentacao', screen, true) as Route}
              aria-current={own ? 'true' : undefined}
              className={option(own)}
            >
              {own ? <span aria-hidden="true">✓ </span> : null}
              {t('own')}
            </Link>
          </li>
        ) : null}
      </ul>
      {ownAvailable ? null : <p className="text-fg-muted">{t('ownUnavailable')}</p>}
    </div>
  );
}
