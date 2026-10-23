import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { StatTile } from '@/components/health/StatTile';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import type { ModuleInsights } from '@/modules/insights';
import { useInsightText } from './text';

/** Id estável do texto do resumo: os gráficos da tela apontam para ele com `aria-describedby`. */
export function summaryTextId(module: ModuleInsights['module']): string {
  return `insights-${module}-text`;
}

/**
 * Resumo do período em texto (ADR-0025, §11.1): 2 a 4 frases por regras, com selo ESTIMADO (ou DEMO).
 * Serve também de alternativa textual aos gráficos para leitor de tela.
 */
export function PeriodSummary({ insights, demo }: { insights: ModuleInsights; demo: boolean }) {
  const t = useTranslations('insights');
  const text = useInsightText(insights.module);
  const headingId = `insights-${insights.module}-title`;
  return (
    <>
      <section
        aria-labelledby={headingId}
        data-tour="summary"
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id={headingId} className="text-base font-semibold">
            {t('title')}
          </h2>
          <ConfidenceBadge level={demo ? 'DEMO' : 'ESTIMADO'} />
        </div>
        <div id={summaryTextId(insights.module)} className="flex flex-col gap-1">
          {insights.sentences.map((s) => (
            <p key={s.key}>{text.sentence(s)}</p>
          ))}
        </div>
        {insights.state === 'partial' ? (
          <p className="text-sm font-semibold">{t('partialNote')}</p>
        ) : null}
        <p className="text-sm text-fg-muted">{t('ruleBased')}</p>
      </section>
    </>
  );
}

/**
 * Colunas da grade de destaques: as linhas sempre completas, sem cartão solto em meia largura (9d0). Um destaque
 * ocupa a largura toda; dois, três e quatro dividem a linha (quatro em 2 × 2 até telas largas).
 */
export function highlightColumns(count: number): string {
  if (count <= 1) return '';
  if (count === 2) return 'sm:grid-cols-2';
  if (count === 3) return 'sm:grid-cols-3';
  if (count === 4) return 'sm:grid-cols-2 xl:grid-cols-4';
  return 'sm:grid-cols-2 xl:grid-cols-3';
}

/** Destaques do período (maior variação, dias extremos, maior sequência), cada um com selo. */
export function PeriodHighlights({ insights, demo }: { insights: ModuleInsights; demo: boolean }) {
  const t = useTranslations('insights');
  const text = useInsightText(insights.module);
  if (insights.highlights.length === 0) return null;
  const headingId = `insights-${insights.module}-highlights`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        {t('highlightsTitle')}
      </h2>
      <div className={cn('grid gap-4', highlightColumns(insights.highlights.length))}>
        {insights.highlights.map((h) => (
          <StatTile
            key={h.key}
            label={text.highlightLabel(h)}
            value={text.value(h.value)}
            detail={text.highlightDetail(h)}
            badge={demo ? 'DEMO' : h.level}
            tilt
          />
        ))}
      </div>
    </section>
  );
}

/** Resumo e destaques juntos, no topo de cada módulo. */
export function PeriodInsights({ insights, demo }: { insights: ModuleInsights; demo: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <PeriodSummary insights={insights} demo={demo} />
      {insights.state === 'ok' ? <PeriodHighlights insights={insights} demo={demo} /> : null}
    </div>
  );
}
