'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

export interface WeekBlock {
  /** Segunda-feira da semana (ISO). */
  start: string;
  /** Domingo da semana (ISO). */
  end: string;
  content: ReactNode;
}

/** Semanas visíveis no início e a cada "Ver mais". */
export const WEEKS_STEP = 2;

/**
 * Lista agrupada por semana (da mais recente à mais antiga): mostra 2 semanas e "Ver mais" revela mais 2 por vez.
 * O foco vai para o título da primeira semana nova e o contador diz quantas aparecem. Só apresentação: os dados
 * do período não mudam.
 */
export function WeeklyList({ weeks }: { weeks: readonly WeekBlock[] }) {
  const t = useTranslations('weekly');
  const format = useFormatter();
  const listId = useId();
  const [shown, setShown] = useState(Math.min(WEEKS_STEP, weeks.length));
  // Primeira semana revelada pelo último "Ver mais": só ela e as seguintes entram em sequência (9f, ADR-0055).
  const [enterFrom, setEnterFrom] = useState<number | null>(null);
  const focusIndex = useRef<number | null>(null);
  const headings = useRef<Array<HTMLHeadingElement | null>>([]);

  useEffect(() => {
    if (focusIndex.current === null) return;
    headings.current[focusIndex.current]?.focus();
    focusIndex.current = null;
  }, [shown]);

  const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const dayMonth = (iso: string) =>
    format
      .dateTime(day(iso), { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .replace(' de ', ' ')
      .replace(/\.$/, '');
  const title = (w: WeekBlock) =>
    t('title', {
      from:
        w.start.slice(0, 7) === w.end.slice(0, 7)
          ? format.dateTime(day(w.start), { day: 'numeric', timeZone: 'UTC' })
          : dayMonth(w.start),
      to: dayMonth(w.end),
    });

  function showMore() {
    focusIndex.current = shown;
    setEnterFrom(shown);
    setShown((n) => Math.min(n + WEEKS_STEP, weeks.length));
  }

  return (
    <div className="flex flex-col gap-4">
      <div id={listId} className="flex flex-col gap-4">
        {weeks.slice(0, shown).map((w, i) => (
          <section
            key={w.start}
            aria-labelledby={`${listId}-${w.start}`}
            className="flex flex-col gap-3"
            data-enter={enterFrom !== null && i >= enterFrom ? '' : undefined}
            style={
              enterFrom !== null && i >= enterFrom
                ? ({ '--hm-enter-i': i - enterFrom } as CSSProperties)
                : undefined
            }
          >
            <h3
              id={`${listId}-${w.start}`}
              ref={(el) => {
                headings.current[i] = el;
              }}
              tabIndex={-1}
              className="text-sm font-semibold text-fg-muted"
            >
              {title(w)}
            </h3>
            {w.content}
          </section>
        ))}
      </div>
      {weeks.length > WEEKS_STEP ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-fg-muted" aria-live="polite">
            {t('count', { shown, total: weeks.length })}
          </p>
          {shown < weeks.length ? (
            <Button
              variant="secondary"
              aria-controls={listId}
              aria-expanded={false}
              onClick={showMore}
            >
              {t('more')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
