'use client';

import { BookOpen, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useId, useState } from 'react';
import { useInsightText } from '@/components/insights/text';
import { ConfidenceBadge, type ConfidenceLevel } from '@/components/ui/ConfidenceBadge';
import { cn } from '@/lib/cn';
import type { BrainThemes } from '@/modules/insights';
import {
  BRAIN_REGION_THEMES,
  BRAIN_REGIONS,
  brainConfidence,
  type BrainRegion,
} from '@/modules/twin';
import { Brain2D } from './fallback/Brain2D';
import { useCompact } from './hooks';
import { VIEW_ANGLE } from './layout';
import { LazyBrainScene } from './LazyScenes';
import { TwinGuide } from './TwinGuide';
import { TwinViewport } from './TwinViewport';
import type { HoverInfo } from './types';
import { useTurntable } from './useTurntable';
import { ViewControls } from './ViewControls';

/** Regiões com texto sobre temas ligados (`twin.brain.regions.<r>.themes`). */
const HAS_THEME_NOTE: ReadonlySet<BrainRegion> = new Set(['frontal', 'temporal', 'brainstem']);

/**
 * Cérebro 3D educativo (§17, §18, LEG-M05): modelo estilizado, igual para todas as pessoas, com regiões
 * clicáveis e painel lateral (nome, função geral, seus registros dos temas ligados, dados usados e nível
 * de confiança). Os avisos `disclaimer.brainModel` e `disclaimer.neurochemistry` ficam sempre visíveis,
 * no 3D e na versão 2D. Nada aqui descreve o estado de uma região.
 */
export function BrainTwin({
  themes,
  demo,
  describedBy,
}: {
  themes: BrainThemes;
  demo: boolean;
  describedBy: string;
}) {
  const t = useTranslations('twin.brain');
  const td = useTranslations('disclaimer');
  const [selected, setSelected] = useState<BrainRegion | null>(null);
  const [hover, setHover] = useState<HoverInfo<BrainRegion> | null>(null);
  const [hideValues, setHideValues] = useState(false);
  const turntable = useTurntable(VIEW_ANGLE.side);
  const compact = useCompact();
  const panelId = useId();
  const clearHover = useCallback(() => setHover(null), []);
  const name = (r: BrainRegion) => t(`regions.${r}.name`);

  return (
    <section aria-labelledby="twin-brain-title" className="flex flex-col gap-4">
      <h2 id="twin-brain-title" className="text-base font-semibold">
        {t('title')}
      </h2>
      <div
        role="note"
        data-testid="brain-disclaimers"
        className="flex gap-3 rounded-lg border border-border bg-info-soft p-4 text-sm"
      >
        <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-info" />
        <div className="flex flex-col gap-1">
          <p>{td('brainModel')}</p>
          <p>{td('neurochemistry')}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">
          <TwinViewport<BrainRegion>
            label={t('title')}
            describedBy={describedBy}
            hover={hover}
            onHoverEnd={clearHover}
            tooltip={(r) => <span className="font-semibold">{name(r)}</span>}
            onDrag={turntable.drag}
            scene={(onFail) => (
              <LazyBrainScene
                angle={turntable.angle}
                instant={turntable.instant}
                selected={selected}
                onSelect={setSelected}
                onHover={setHover}
                onFail={onFail}
                compact={compact}
              />
            )}
            fallback={<Brain2D selected={selected} onSelect={setSelected} />}
          />
          <ViewControls
            angle={turntable.angle}
            onAngle={turntable.turnTo}
            onReset={() => {
              turntable.reset();
              setSelected(null);
            }}
            hideValues={hideValues}
            onHideValues={setHideValues}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{t('regionsTitle')}</h3>
          <ul className="flex flex-wrap gap-2">
            {BRAIN_REGIONS.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  aria-pressed={selected === r}
                  aria-controls={panelId}
                  onClick={() => setSelected(r)}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-semibold',
                    selected === r
                      ? 'border-primary bg-primary-soft text-primary-soft-fg'
                      : 'border-border-strong bg-surface hover:bg-surface-muted',
                  )}
                >
                  {name(r)}
                </button>
              </li>
            ))}
          </ul>
          <div
            id={panelId}
            aria-live="polite"
            className="flex min-h-28 flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-sm"
          >
            {selected ? (
              <BrainPanel region={selected} themes={themes} demo={demo} hideValues={hideValues} />
            ) : (
              <p className="text-fg-muted">{t('pick')}</p>
            )}
          </div>
        </div>
      </div>
      <TwinGuide id="brain" />
    </section>
  );
}

function BrainPanel({
  region,
  themes,
  demo,
  hideValues,
}: {
  region: BrainRegion;
  themes: BrainThemes;
  demo: boolean;
  hideValues: boolean;
}) {
  const t = useTranslations('twin.brain');
  const ti = useTranslations('insights.brain.indicators');
  const tc = useTranslations('twin.controls');
  const text = useInsightText('brain');
  const level = (l: ConfidenceLevel): ConfidenceLevel => (demo ? 'DEMO' : l);
  const related = BRAIN_REGION_THEMES[region];
  const days = {
    sleep: themes.themes.sleep.days,
    mood: themes.themes.mood.days,
    habits: themes.themes.habits.days,
  };
  const confidence = brainConfidence(related, days, themes.periodDays);
  type IndicatorKey = Parameters<typeof ti>[0];

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">{t(`regions.${region}.name`)}</p>
        <p className="inline-flex items-center gap-1 text-fg-muted">
          <BookOpen aria-hidden className="size-4" />
          {t('educational')}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <h4 className="font-semibold">{t('functionTitle')}</h4>
        <p>{t(`regions.${region}.function`)}</p>
        {HAS_THEME_NOTE.has(region) ? (
          <p>{t(`regions.${region as 'frontal' | 'temporal' | 'brainstem'}.themes`)}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="font-semibold">{t('themesTitle')}</h4>
        {related.length === 0 ? (
          <p>{t('noThemes')}</p>
        ) : (
          <>
            {related.map((theme) => {
              const data = themes.themes[theme];
              return (
                <div key={theme} className="flex flex-col gap-1">
                  <p className="font-semibold">{t(`themes.${theme}`)}</p>
                  {data.indicators.length === 0 ? (
                    <p className="text-fg-muted">{t('noRecords')}</p>
                  ) : (
                    <dl className="flex flex-col gap-1">
                      {data.indicators.map((ind) => (
                        <div
                          key={ind.key}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                        >
                          <dt className="text-fg-muted">{ti(ind.key as IndicatorKey)}</dt>
                          <dd className="flex items-center gap-2">
                            <span className="tabular font-semibold">
                              {hideValues ? tc('hidden') : text.value(ind.value)}
                            </span>
                            <ConfidenceBadge level={level(ind.level)} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}
            <p className="text-fg-muted">{t('notAboutRegion')}</p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="font-semibold">{t('dataUsedTitle')}</h4>
        {related.length === 0 ? (
          <p>{t('dataUsedNone')}</p>
        ) : (
          <ul className="list-disc pl-5">
            {related.map((theme) => (
              <li key={theme}>
                {t('dataUsed', { theme: t(`themes.${theme}`), days: days[theme] })}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">{t('confidenceTitle')}</h4>
          <ConfidenceBadge level={level('INFERIDO')} />
        </div>
        <p className="font-semibold" data-testid="brain-confidence">
          {t(`confidence.${confidence}`)}
        </p>
        <p className="text-fg-muted">{t('confidenceHint')}</p>
      </div>
    </>
  );
}
