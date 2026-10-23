import { useFormatter, useTranslations } from 'next-intl';
import { TimeChart } from '@/components/charts/TimeChart';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import type { ReportModel } from '@/modules/reports';
import { reportDocument, type ReportTranslate } from './document';

const CHART_OF: Partial<Record<string, 'sleep' | 'activity' | 'weight'>> = {
  sleep: 'sleep',
  activity: 'activity',
  body: 'weight',
};

/**
 * Relatório na tela (§29, ADR-0032): o mesmo documento do PDF, com os gráficos interativos (tabela alternativa
 * no próprio gráfico) e os selos. O rodapé fixo aparece também aqui.
 */
export function ReportView({ model, generatedOn }: { model: ReportModel; generatedOn: string }) {
  const t = useTranslations();
  const format = useFormatter();
  const doc = reportDocument(model, t as unknown as ReportTranslate, format, generatedOn);
  const demo = model.source === 'demo';
  const level = (l: 'INFORMADO' | 'ESTIMADO') => (demo ? 'DEMO' : l);

  return (
    <article aria-labelledby="report-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 id="report-title" className="text-lg font-semibold">
          {doc.title}
        </h2>
        <p className="text-sm text-fg-muted">{doc.range}</p>
        {doc.notices.map((n) => (
          <p key={n} className="rounded-md bg-surface-muted p-3 text-sm">
            {n}
          </p>
        ))}
      </header>

      {!model.hasData ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm">
          {t('reports.noData')}
        </p>
      ) : null}

      <section
        aria-labelledby="report-score"
        className="rounded-lg border border-border bg-surface p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="report-score" className="text-base font-semibold">
            {doc.score.title}
          </h3>
          {model.score.value !== null ? <ConfidenceBadge level={level('ESTIMADO')} /> : null}
        </div>
        {doc.score.lines.map((line) => (
          <p key={line} className="mt-1 text-sm">
            {line}
          </p>
        ))}
      </section>

      {doc.sections.map((s) => {
        const chartId = CHART_OF[s.module];
        const chart = chartId ? model.charts.find((c) => c.id === chartId) : undefined;
        const chartDoc = chartId ? doc.charts.find((c) => c.id === chartId) : undefined;
        const headingId = `report-section-${s.module}`;
        return (
          <section
            key={s.module}
            aria-labelledby={headingId}
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <h3 id={headingId} className="text-base font-semibold">
              {s.heading}
            </h3>
            <div id={`${headingId}-text`} className="flex flex-col gap-1 text-sm">
              {s.sentences.map((x) => (
                <p key={x}>{x}</p>
              ))}
            </div>
            {s.highlights.length > 0 ? (
              <ul aria-label={t('reports.highlights')} className="grid gap-2 sm:grid-cols-2">
                {s.highlights.map((h) => (
                  <li key={h.label} className="rounded-md bg-surface-muted p-3 text-sm">
                    <span className="font-medium">{h.label}: </span>
                    {h.value}
                    {h.detail ? <span className="block text-fg-muted">{h.detail}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {chart && chartDoc ? (
              <TimeChart
                // Relatório é documento: só esmaece, em qualquer tema (inclusive corpo, LEG-M06).
                entrance="fade"
                title={`${chartDoc.title} · ${chartDoc.caption}`}
                badge={level(chart.badge)}
                describedBy={`${headingId}-text`}
                data={chart.points.map((p) => ({ day: p.day, value: p.value }))}
                series={[
                  {
                    key: 'value',
                    label: chartDoc.title,
                    unit: chart.unit,
                    kind: chart.id === 'activity' ? 'bar' : 'line',
                    color: 'var(--hm-chart-1)',
                  },
                ]}
              />
            ) : null}
          </section>
        );
      })}

      <section
        aria-labelledby="report-goals"
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
      >
        <h3 id="report-goals" className="text-base font-semibold">
          {doc.goals.title}
        </h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {doc.goals.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="text-sm text-fg-muted">{doc.goals.note}</p>
      </section>

      <footer className="border-t border-border pt-3 text-sm text-fg-muted">{doc.footer}</footer>
    </article>
  );
}
