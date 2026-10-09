'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useId, useMemo, useState } from 'react';
import { ConfidenceBadge, type ConfidenceLevel } from '@/components/ui/ConfidenceBadge';
import { cn } from '@/lib/cn';
import {
  bodyShape,
  bodySnapshotAt,
  firstMeasure,
  measurementDays,
  REGION_FIELD,
  type BodyRegion,
  type BodySnapshot,
  type TwinRow,
} from '@/modules/twin';
import { BodyCompare } from './BodyCompare';
import { BodyModelPicker, useBodyModel } from './BodyModelPicker';
import { BodySilhouette2D } from './fallback/BodySilhouette2D';
import { useTwinFormat } from './format';
import { useCompact } from './hooks';
import { BODY_REGION_ORDER, VIEW_ANGLE } from './layout';
import { LazyBodyScene } from './LazyScenes';
import { TwinGuide } from './TwinGuide';
import { TwinViewport } from './TwinViewport';
import type { HoverInfo } from './types';
import { useTurntable } from './useTurntable';
import { ViewControls } from './ViewControls';

/**
 * Corpo 3D (§15, ADR-0026): modelo paramétrico com controle de datas, regiões com tooltip, vistas,
 * restaurar e modo privacidade local (oculta os números; não é salvo). Recebe só dia e medidas
 * (`TwinRow`). Selos INFORMADO/ESTIMADO, ou DEMO na demonstração (CLAUDE.md regra 7).
 */
export function BodyTwin({
  rows,
  latestHeightCm,
  demo,
  describedBy,
}: {
  rows: TwinRow[];
  latestHeightCm: number | null;
  demo: boolean;
  describedBy: string;
}) {
  const t = useTranslations('twin.body');
  const days = useMemo(() => measurementDays(rows), [rows]);
  const [index, setIndex] = useState(Math.max(0, days.length - 1));
  const [selected, setSelected] = useState<BodyRegion | null>(null);
  const [hover, setHover] = useState<HoverInfo<BodyRegion> | null>(null);
  const [hideValues, setHideValues] = useState(false);
  const [model] = useBodyModel();
  const turntable = useTurntable(VIEW_ANGLE.front);
  const compact = useCompact();
  const fmt = useTwinFormat(hideValues);
  const level = (l: ConfidenceLevel): ConfidenceLevel => (demo ? 'DEMO' : l);
  const sliderId = useId();
  const panelId = useId();

  const day = days[Math.min(index, days.length - 1)] ?? null;
  const snapshot: BodySnapshot = useMemo(
    () => bodySnapshotAt(rows, day ?? '9999-12-31', latestHeightCm),
    [rows, day, latestHeightCm],
  );
  const shape = useMemo(() => bodyShape(snapshot), [snapshot]);
  const clearHover = useCallback(() => setHover(null), []);
  const select = (region: BodyRegion) => setSelected(region);

  const regionName = (r: BodyRegion) => t(`regions.${r}`);
  const regionLine = (r: BodyRegion) => {
    const m = snapshot.values[REGION_FIELD[r]];
    return m ? t('measure', { value: fmt.value(m.value, 'cm') }) : t('notInformed');
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="twin-body-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="twin-body-title" className="text-base font-semibold">
            {t('title')}
          </h2>
          <ConfidenceBadge level={level('INFORMADO')} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-3">
            <TwinViewport<BodyRegion>
              label={t('title')}
              describedBy={describedBy}
              hover={hover}
              onHoverEnd={clearHover}
              tooltip={(r) => (
                <>
                  <span className="block font-semibold">{regionName(r)}</span>
                  <span className="block">{regionLine(r)}</span>
                </>
              )}
              onDrag={turntable.drag}
              scene={(onFail) => (
                <LazyBodyScene
                  shape={shape}
                  model={model}
                  angle={turntable.angle}
                  instant={turntable.instant}
                  selected={selected}
                  onSelect={select}
                  onHover={setHover}
                  onFail={onFail}
                  compact={compact}
                />
              )}
              fallback={
                <BodySilhouette2D
                  shape={shape}
                  angle={turntable.angle}
                  selected={selected}
                  onSelect={select}
                />
              }
            />
            <ViewControls
              angle={turntable.angle}
              onAngle={turntable.turnTo}
              onReset={() => {
                turntable.reset();
                setSelected(null);
                setIndex(Math.max(0, days.length - 1));
              }}
              hideValues={hideValues}
              onHideValues={setHideValues}
            />
            <BodyModelPicker />
            {days.length > 1 && day ? (
              <div className="flex flex-col gap-1">
                <label htmlFor={sliderId} className="text-sm font-semibold">
                  {t('dateLabel')}: <span className="tabular">{fmt.longDay(day)}</span>
                </label>
                <input
                  id={sliderId}
                  type="range"
                  min={0}
                  max={days.length - 1}
                  step={1}
                  value={Math.min(index, days.length - 1)}
                  aria-valuetext={fmt.longDay(day)}
                  aria-describedby={`${sliderId}-help`}
                  onChange={(e) => setIndex(Number(e.target.value))}
                  className="min-h-11 w-full accent-primary"
                />
                <p id={`${sliderId}-help`} className="text-sm text-fg-muted">
                  {t('dateHelp')}
                </p>
              </div>
            ) : day ? (
              <p className="text-sm">
                {t('dateLabel')}: <span className="tabular">{fmt.longDay(day)}</span>
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{t('regionsTitle')}</h3>
            <ul className="flex flex-wrap gap-2">
              {BODY_REGION_ORDER.map((r) => (
                <li key={r}>
                  <button
                    type="button"
                    aria-pressed={selected === r}
                    aria-controls={panelId}
                    onClick={() => select(r)}
                    className={cn(
                      'inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-semibold',
                      selected === r
                        ? 'border-primary bg-primary-soft text-primary-soft-fg'
                        : 'border-border-strong bg-surface hover:bg-surface-muted',
                    )}
                  >
                    {regionName(r)}
                  </button>
                </li>
              ))}
            </ul>
            <div
              id={panelId}
              aria-live="polite"
              className="flex min-h-28 flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-sm"
            >
              {selected ? (
                <RegionPanel
                  region={selected}
                  snapshot={snapshot}
                  rows={rows}
                  name={regionName(selected)}
                  hideValues={hideValues}
                  level={level}
                />
              ) : (
                <p className="text-fg-muted">{t('pick')}</p>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <MeasureLine
                label={t('height')}
                value={snapshot.values.heightCm?.value ?? null}
                unit="cm"
                hideValues={hideValues}
                badge={level('INFORMADO')}
              />
              <MeasureLine
                label={t('weight')}
                value={snapshot.values.weightKg?.value ?? null}
                unit="kg"
                hint={t('weightHint')}
                hideValues={hideValues}
                badge={level('INFORMADO')}
              />
            </dl>
          </div>
        </div>
        <TwinGuide id="body" />
      </section>

      <BodyCompare
        rows={rows}
        latestHeightCm={latestHeightCm}
        demo={demo}
        hideValues={hideValues}
      />
    </div>
  );
}

function RegionPanel({
  region,
  snapshot,
  rows,
  name,
  hideValues,
  level,
}: {
  region: BodyRegion;
  snapshot: BodySnapshot;
  rows: TwinRow[];
  name: string;
  hideValues: boolean;
  level: (l: ConfidenceLevel) => ConfidenceLevel;
}) {
  const t = useTranslations('twin.body');
  const fmt = useTwinFormat(hideValues);
  const field = REGION_FIELD[region];
  const current = snapshot.values[field];
  const first = firstMeasure(rows, field);
  const delta =
    current && first && current.day !== first.day
      ? Math.round((current.value - first.value) * 10) / 10
      : null;
  return (
    <>
      <p className="font-semibold">{name}</p>
      {current ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="tabular">{t('measure', { value: fmt.value(current.value, 'cm') })}</p>
            <ConfidenceBadge level={level('INFORMADO')} />
          </div>
          <p className="text-fg-muted">
            {current.day ? t('recordedOn', { date: fmt.longDay(current.day) }) : t('beforePeriod')}
          </p>
          {delta !== null ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="tabular">{t('change', { delta: fmt.signed(delta, 'cm') })}</p>
              <ConfidenceBadge level={level('ESTIMADO')} />
            </div>
          ) : null}
        </>
      ) : (
        <p>{t('notInformed')}</p>
      )}
    </>
  );
}

function MeasureLine({
  label,
  value,
  unit,
  hint,
  hideValues,
  badge,
}: {
  label: string;
  value: number | null;
  unit: string;
  hint?: string;
  hideValues: boolean;
  badge: ConfidenceLevel;
}) {
  const t = useTranslations('twin.body');
  const fmt = useTwinFormat(hideValues);
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="flex flex-wrap items-center justify-between gap-1">
        <span className="tabular font-semibold">
          {value === null ? t('notInformedShort') : fmt.value(value, unit)}
        </span>
        <ConfidenceBadge level={badge} />
      </dd>
      {hint ? <dd className="text-fg-muted">{hint}</dd> : null}
    </div>
  );
}
