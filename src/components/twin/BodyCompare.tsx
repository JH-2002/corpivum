'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useId, useMemo, useState } from 'react';
import { ConfidenceBadge, type ConfidenceLevel } from '@/components/ui/ConfidenceBadge';
import { cn } from '@/lib/cn';
import {
  bodyShape,
  bodySnapshotAt,
  compareSnapshots,
  measurementDays,
  REGION_FIELD,
  type BodyRegion,
  type Direction,
  type TwinRow,
} from '@/modules/twin';
import { BodySilhouette2D } from './fallback/BodySilhouette2D';
import { useTwinFormat } from './format';
import { useCompact } from './hooks';
import { VIEW_ANGLE } from './layout';
import { LazyBodyScene } from './LazyScenes';
import { TwinGuide } from './TwinGuide';
import { TwinViewport } from './TwinViewport';
import type { HoverInfo } from './types';
import { useTurntable } from './useTurntable';
import { ViewControls } from './ViewControls';

/** Seta de apoio visual; a palavra ao lado diz o mesmo (cor nunca é o único canal). */
const ARROW: Record<Direction, string> = { up: '↑', down: '↓', same: '=' };

type Side = 'before' | 'after';

/**
 * Antes × Agora (§16, ADR-0026): dois modelos com rotação sincronizada (um controle para os dois) e a
 * tabela de diferenças em número, seta e palavra. Em tela estreita, um modelo por vez (§42).
 */
export function BodyCompare({
  rows,
  latestHeightCm,
  demo,
  hideValues,
}: {
  rows: TwinRow[];
  latestHeightCm: number | null;
  demo: boolean;
  hideValues: boolean;
}) {
  const t = useTranslations('twin.compare');
  const tb = useTranslations('twin.body');
  const tf = useTranslations('body.fields');
  const days = useMemo(() => measurementDays(rows), [rows]);
  const [before, setBefore] = useState(days[0] ?? '');
  const [after, setAfter] = useState(days[days.length - 1] ?? '');
  const [showing, setShowing] = useState<Side>('after');
  const [selected, setSelected] = useState<BodyRegion | null>(null);
  const [hover, setHover] = useState<{ side: Side; info: HoverInfo<BodyRegion> } | null>(null);
  const turntable = useTurntable(VIEW_ANGLE.front);
  const compact = useCompact();
  const fmt = useTwinFormat(hideValues);
  const level = (l: ConfidenceLevel): ConfidenceLevel => (demo ? 'DEMO' : l);
  const id = useId();
  const clearHover = useCallback(() => setHover(null), []);

  const snapshots = useMemo(
    () => ({
      before: bodySnapshotAt(rows, before, latestHeightCm),
      after: bodySnapshotAt(rows, after, latestHeightCm),
    }),
    [rows, before, after, latestHeightCm],
  );
  const shapes = useMemo(
    () => ({ before: bodyShape(snapshots.before), after: bodyShape(snapshots.after) }),
    [snapshots],
  );
  const diffs = useMemo(() => compareSnapshots(snapshots.before, snapshots.after), [snapshots]);

  if (days.length < 2) {
    return (
      <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
        <h2 id={`${id}-title`} className="text-base font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-fg-muted">{t('needTwo')}</p>
      </section>
    );
  }

  const unit = (field: string) => (field === 'weightKg' ? 'kg' : 'cm');
  const sides: Side[] = compact ? [showing] : ['before', 'after'];

  const viewer = (side: Side) => (
    <div key={side} className="flex flex-col gap-1">
      <p className="text-sm font-semibold">
        {t(side)}:{' '}
        <span className="tabular">{fmt.longDay(side === 'before' ? before : after)}</span>
      </p>
      <TwinViewport<BodyRegion>
        label={`${t(side)}: ${fmt.longDay(side === 'before' ? before : after)}`}
        describedBy={`${id}-table`}
        hover={hover?.side === side ? hover.info : null}
        onHoverEnd={clearHover}
        tooltip={(r) => {
          const m = snapshots[side].values[REGION_FIELD[r]];
          return (
            <>
              <span className="block font-semibold">{tb(`regions.${r}`)}</span>
              <span className="block">
                {m ? tb('measure', { value: fmt.value(m.value, 'cm') }) : tb('notInformed')}
              </span>
            </>
          );
        }}
        onDrag={turntable.drag}
        className="h-[300px] sm:h-[380px]"
        scene={(onFail) => (
          <LazyBodyScene
            shape={shapes[side]}
            angle={turntable.angle}
            instant={turntable.instant}
            selected={selected}
            onSelect={setSelected}
            onHover={(info) => setHover(info ? { side, info } : null)}
            onFail={onFail}
            compact={compact}
          />
        )}
        fallback={
          <BodySilhouette2D
            shape={shapes[side]}
            angle={turntable.angle}
            selected={selected}
            onSelect={setSelected}
          />
        }
      />
    </div>
  );

  const dateSelect = (side: Side) => (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {t(side === 'before' ? 'pickBefore' : 'pickAfter')}
      <select
        value={side === 'before' ? before : after}
        onChange={(e) => (side === 'before' ? setBefore : setAfter)(e.target.value)}
        className="min-h-11 rounded-md border border-border-strong bg-surface px-3 font-normal"
      >
        {days.map((d) => (
          <option key={d} value={d}>
            {fmt.longDay(d)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={`${id}-title`} className="text-base font-semibold">
          {t('title')}
        </h2>
        <ConfidenceBadge level={level('INFORMADO')} />
      </div>
      <p className="text-sm text-fg-muted">{t('description')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {dateSelect('before')}
        {dateSelect('after')}
      </div>
      {compact ? (
        <div role="group" aria-label={t('showing')} className="flex gap-2">
          {(['before', 'after'] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={showing === side}
              onClick={() => setShowing(side)}
              className={cn(
                'inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold',
                showing === side
                  ? 'border-primary bg-primary-soft text-primary-soft-fg'
                  : 'border-border-strong bg-surface hover:bg-surface-muted',
              )}
            >
              {t(side)}
            </button>
          ))}
        </div>
      ) : null}
      <div className={cn('grid gap-4', !compact && 'sm:grid-cols-2')}>{sides.map(viewer)}</div>
      <ViewControls
        angle={turntable.angle}
        onAngle={turntable.turnTo}
        onReset={() => {
          turntable.reset();
          setSelected(null);
        }}
      />

      <div className="overflow-x-auto">
        <table id={`${id}-table`} className="w-full border-collapse text-left text-sm">
          <caption className="mb-2 text-left font-semibold">
            <span className="flex flex-wrap items-center justify-between gap-2">
              {t('caption')}
              <ConfidenceBadge level={level('ESTIMADO')} />
            </span>
          </caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border p-2">
                {t('field')}
              </th>
              <th scope="col" className="border-b border-border p-2">
                {t('before')}
              </th>
              <th scope="col" className="border-b border-border p-2">
                {t('after')}
              </th>
              <th scope="col" className="border-b border-border p-2">
                {t('difference')}
              </th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => (
              <tr key={d.field}>
                <th scope="row" className="border-b border-border p-2 font-normal">
                  {tf(d.field)}
                </th>
                <td className="tabular border-b border-border p-2">
                  {d.before ? fmt.value(d.before.value, unit(d.field)) : t('noValue')}
                </td>
                <td className="tabular border-b border-border p-2">
                  {d.after ? fmt.value(d.after.value, unit(d.field)) : t('noValue')}
                </td>
                <td className="tabular border-b border-border p-2">
                  {d.delta !== null && d.direction ? (
                    <>
                      <span aria-hidden>{ARROW[d.direction]} </span>
                      {d.direction === 'same'
                        ? t('direction.same')
                        : `${fmt.signed(d.delta, unit(d.field))} (${t(`direction.${d.direction}`)})`}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TwinGuide id="compare" />
    </section>
  );
}
