import { Info } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { HealthMode } from '@/components/health/HealthPage';
import { PeriodInsights, summaryTextId } from '@/components/insights/PeriodInsights';
import { buttonClasses } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import type { DateRange } from '@/lib/period';
import type { BodyRecord } from '@/modules/body';
import { twinBodyInsights, twinBodyInsightsHidden } from '@/modules/insights';
import { toTwinRows } from '@/modules/twin';
import { BodyTwin } from './BodyTwin';

/**
 * Corpo 3D (§15, §16, ADR-0026): resumo por regras, aviso de representação aproximada, modelo e
 * comparação. Recebe só as medições do período, já lidas com consentimento (ou do demo). Ao navegador
 * vão só dia e medidas (`toTwinRows`). Sem medição no período, mostra o estado "sem dados" (§34).
 * Modo privacidade (`hidden`, ADR-0035): com dados próprios, as medições já chegam sem valores
 * (`maskBodyScreen`) e o modelo fica na forma de referência; no demo, só os números ficam ocultos.
 */
export function TwinBodyView({
  records,
  latestHeightCm,
  range,
  today,
  mode,
  hidden = false,
}: {
  records: BodyRecord[];
  latestHeightCm: number | null;
  range: DateRange;
  today: string;
  mode: HealthMode;
  hidden?: boolean;
}) {
  const t = useTranslations('disclaimer');
  const tn = useTranslations('nav');
  const demo = mode !== 'own';
  const insights = hidden
    ? twinBodyInsightsHidden({ records, range, today, referenceShape: !demo })
    : twinBodyInsights({ records, latestHeightCm, range, today });
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
          hidden={hidden}
        />
      )}
    </div>
  );
}
