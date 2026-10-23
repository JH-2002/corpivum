'use client';

import dynamic from 'next/dynamic';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { ConfidenceBadge, type ConfidenceLevel } from '@/components/ui/ConfidenceBadge';
import { StateView } from '@/components/ui/StateView';
import { cn } from '@/lib/cn';
import { ChartGuide, type ChartGuideId } from './ChartGuide';
import { formatNumber, formatSigned, hasValues, valueOf } from './format';

/**
 * O desenho (recharts, ~119 KiB gzip) vem num chunk próprio, depois da hidratação (§41, orçamento da 7d): o
 * `ResponsiveContainer` não desenha nada no servidor (precisa medir a largura), então o HTML inicial é o mesmo.
 * Título, selo, legenda e tabela alternativa ficam aqui e funcionam antes do desenho chegar.
 */
const LazyTimeChartPlot = dynamic(() => import('./TimeChartPlot').then((m) => m.TimeChartPlot), {
  ssr: false,
});

export interface ChartSeries {
  key: string;
  /** Rótulo já traduzido. */
  label: string;
  unit?: string;
  kind: 'line' | 'bar';
  /** Cor por token (ex.: `var(--hm-chart-1)`). Nunca é o único canal: há padrão de linha e rótulo. */
  color: string;
  /** Padrão de traço da linha (`stroke-dasharray`). */
  dash?: string;
  axis?: 'left' | 'right';
  decimals?: number;
  /** Contagem (refeições, sessões, hábitos): eixo só com números inteiros. */
  integer?: boolean;
  /** Variação (diferença desde um ponto de partida): eixo e dica com sinal (+1,2 / −0,4). */
  signed?: boolean;
}

/** Linha do gráfico: o dia e os valores das séries (número, ou `null` sem registro). */
export type ChartRow = { day: string };

export interface TimeChartProps<T extends ChartRow> {
  title: string;
  description?: string;
  data: readonly T[];
  /** Valores da tabela alternativa quando o desenho mostra outra coisa (ex.: variação no gráfico, medidas na
   * tabela). Mesmas chaves das séries; sem ele, a tabela traz os valores do gráfico. */
  tableData?: readonly ChartRow[];
  series: readonly ChartSeries[];
  badge: ConfidenceLevel;
  height?: number;
  /** Ignorado no eixo que tem barras: barras sempre começam em zero. */
  leftDomain?: [number, number];
  rightDomain?: [number, number];
  /** Estilo compacto (sem eixo Y à direita no mobile). */
  className?: string;
  /** "Como ler este gráfico" (ADR-0025). */
  guide?: ChartGuideId;
  /** Id do resumo em texto da tela, que descreve o período (`aria-describedby`). */
  describedBy?: string;
}

/**
 * Gráfico temporal (§13): tooltip com data, valor, unidade e selo; legenda clicável que alterna as séries
 * (botões com `aria-pressed`); padrão de traço além da cor; tabela alternativa acessível; sem animação com
 * `prefers-reduced-motion`. Sem nenhum valor no período, mostra o estado "sem dados" (nunca gráfico vazio).
 */
export function TimeChart<T extends ChartRow>({
  title,
  description,
  data,
  tableData,
  series,
  badge,
  height = 260,
  leftDomain,
  rightDomain,
  className,
  guide,
  describedBy,
}: TimeChartProps<T>) {
  const t = useTranslations('charts');
  const format = useFormatter();
  const headingId = useId();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const visible = series.filter((s) => !hidden.has(s.key));
  const hasData = hasValues(
    data,
    series.map((s) => s.key),
  );
  const hasRight = visible.some((s) => s.axis === 'right');

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      // Ao menos uma série continua visível.
      else if (series.length - prev.size > 1) next.add(key);
      return next;
    });
  }

  const longDate = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });

  return (
    <section
      aria-labelledby={headingId}
      aria-describedby={describedBy}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-surface p-4',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold">
            {title}
          </h2>
          {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
        </div>
        <ConfidenceBadge level={badge} />
      </div>

      {!hasData ? (
        <StateView state="no-data" />
      ) : (
        <>
          {guide ? <ChartGuide id={guide} series={series} badge={badge} /> : null}
          <div role="group" aria-label={t('legend')} className="flex flex-wrap gap-2">
            {series.map((s) => {
              const on = !hidden.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.key)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm',
                    on
                      ? 'border-border-strong bg-surface'
                      : 'border-border text-fg-muted line-through',
                  )}
                >
                  <svg width="24" height="10" aria-hidden="true">
                    {s.kind === 'bar' ? (
                      <rect x="6" y="0" width="12" height="10" fill={s.color} />
                    ) : (
                      <line
                        x1="0"
                        y1="5"
                        x2="24"
                        y2="5"
                        stroke={s.color}
                        strokeWidth="3"
                        strokeDasharray={s.dash}
                      />
                    )}
                  </svg>
                  {s.label}
                  <span className="sr-only">{on ? t('seriesOn') : t('seriesOff')}</span>
                </button>
              );
            })}
          </div>

          {/* O desenho é complementar: a tabela abaixo traz os mesmos valores para leitor de tela. */}
          <div aria-hidden="true" style={{ height }}>
            <LazyTimeChartPlot
              data={data}
              series={series}
              visible={visible}
              badge={badge}
              hasRight={hasRight}
              leftDomain={leftDomain}
              rightDomain={rightDomain}
            />
          </div>

          <ChartTable
            title={title}
            data={tableData ?? data}
            series={tableData ? series.map((s) => ({ ...s, signed: false })) : series}
            longDate={longDate}
          />
        </>
      )}
    </section>
  );
}

/** Tabela alternativa acessível (§13): mesmos valores do gráfico. */
export function ChartTable({
  title,
  data,
  series,
  longDate,
}: {
  title: string;
  data: readonly ChartRow[];
  series: readonly Pick<ChartSeries, 'key' | 'label' | 'unit' | 'decimals' | 'signed'>[];
  longDate: (iso: string) => string;
}) {
  const t = useTranslations('charts');
  const rows = data.filter((row) =>
    series.some((s) => ['number', 'string'].includes(typeof valueOf(row, s.key))),
  );
  return (
    <details className="text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
        {t('showTable')}
      </summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border p-2">
                {t('date')}
              </th>
              {series.map((s) => (
                <th key={s.key} scope="col" className="border-b border-border p-2">
                  {s.label}
                  {s.unit ? ` (${s.unit})` : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day}>
                <th scope="row" className="border-b border-border p-2 font-normal">
                  {longDate(row.day)}
                </th>
                {series.map((s) => {
                  const v = valueOf(row, s.key);
                  return (
                    <td key={s.key} className="tabular border-b border-border p-2">
                      {typeof v === 'number'
                        ? (s.signed ? formatSigned : formatNumber)(v, s.decimals)
                        : typeof v === 'string'
                          ? v
                          : t('empty')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
