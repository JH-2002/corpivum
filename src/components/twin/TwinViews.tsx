import { Info } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import type { HealthMode } from '@/components/health/HealthPage';
import { PeriodInsights, summaryTextId } from '@/components/insights/PeriodInsights';
import { buttonClasses } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { cn } from '@/lib/cn';
import type { DateRange } from '@/lib/period';
import type { BodyRecord } from '@/modules/body';
import { brainInsights, twinBodyInsights, type BrainThemes } from '@/modules/insights';
import { toTwinRows } from '@/modules/twin';
import { BodyTwin } from './BodyTwin';
import { BrainTwin } from './BrainTwin';

export type TwinSection = 'body' | 'brain';

const SECTION_PATH: Record<TwinSection, string> = { body: '', brain: '/cerebro' };

/** Abas do Health Twin (corpo e cérebro), na conta (`/twin`) e no demo público (`/demo/twin`). */
export function TwinSections({
  base,
  current,
}: {
  base: '/twin' | '/demo/twin';
  current: TwinSection;
}) {
  const t = useTranslations('twin');
  return (
    <nav aria-label={t('sectionsLabel')}>
      <ul className="flex flex-wrap gap-2">
        {(['body', 'brain'] as const).map((section) => (
          <li key={section}>
            <Link
              href={`${base}${SECTION_PATH[section]}` as Route}
              aria-current={section === current ? 'page' : undefined}
              className={cn(
                buttonClasses(section === current ? 'primary' : 'secondary'),
                'min-w-32',
              )}
            >
              {t(`sections.${section}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Corpo 3D (§15, §16, ADR-0026): resumo por regras, aviso de representação aproximada, modelo e
 * comparação. Recebe só as medições do período, já lidas com consentimento (ou do demo). Ao navegador
 * vão só dia e medidas (`toTwinRows`). Sem medição no período, mostra o estado "sem dados" (§34).
 */
export function TwinBodyView({
  records,
  latestHeightCm,
  range,
  today,
  mode,
}: {
  records: BodyRecord[];
  latestHeightCm: number | null;
  range: DateRange;
  today: string;
  mode: HealthMode;
}) {
  const t = useTranslations('disclaimer');
  const tn = useTranslations('nav');
  const demo = mode !== 'own';
  const insights = twinBodyInsights({ records, latestHeightCm, range, today });
  return (
    <div className="flex flex-col gap-6">
      <PeriodInsights insights={insights} demo={demo} />
      <p className="flex gap-2 text-sm text-fg-muted" data-testid="body-disclaimer">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t('bodyModel')}
      </p>
      {records.length === 0 ? (
        <StateView
          state="no-data"
          action={
            mode === 'own' ? (
              <Link href="/corpo#novo" className={buttonClasses('secondary')}>
                {tn('body')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <BodyTwin
          // Período novo = estado novo (datas do controle e da comparação).
          key={`${range.from}:${range.to}`}
          rows={toTwinRows(records)}
          latestHeightCm={latestHeightCm}
          demo={demo}
          describedBy={summaryTextId('twin')}
        />
      )}
    </div>
  );
}

/**
 * Cérebro 3D educativo (§17, §18, LEG-M05). Os temas chegam resumidos do servidor (`brainThemes`):
 * números, sem nota, nome de hábito ou texto do diário. O modelo aparece mesmo sem registros, porque é
 * conteúdo educativo.
 */
export function TwinBrainView({
  themes,
  range,
  today,
  mode,
}: {
  themes: BrainThemes;
  range: DateRange;
  today: string;
  mode: HealthMode;
}) {
  const demo = mode !== 'own';
  return (
    <div className="flex flex-col gap-6">
      <PeriodInsights insights={brainInsights(themes, range, today)} demo={demo} />
      <BrainTwin themes={themes} demo={demo} describedBy={summaryTextId('brain')} />
    </div>
  );
}
