'use client';

import { Box, Info, Orbit } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from 'react';
import { Sparkline } from '@/components/charts/Sparkline';
import { Button, buttonClasses } from '@/components/ui/Button';
import { ConfidenceBadge, type ConfidenceLevel } from '@/components/ui/ConfidenceBadge';
import { TiltCard } from '@/components/ui/TiltCard';
import { usePrivacyHiddenNow } from '@/components/privacy-mode/PrivacyModeProvider';
import { cn } from '@/lib/cn';
import { useFinePointer, useMotionPreference } from '@/lib/motion/motion';
import {
  bodyShape,
  bodySnapshotAt,
  canAutoload3D,
  demoTwinRows,
  withoutMeasures,
  firstMeasure,
  REGION_FIELD,
  type BodyRegion,
  type BodySnapshot,
  type DeviceSignals,
  type TwinRow,
} from '@/modules/twin';
import { BodyModelPrompt, useBodyModel } from './BodyModelPicker';
import { BodySilhouette2D } from './fallback/BodySilhouette2D';
import { useTwinFormat } from './format';
import { HoloLoading } from './HoloLoading';
import { useCompact, useMediaQuery, useWebGLSupport } from './hooks';
import { BODY_REGION_ORDER, VIEW_ANGLE } from './layout';
import { LazyBodyScene } from './LazyScenes';
import { TwinViewport } from './TwinViewport';
import type { BodySceneStatus, HoverInfo } from './types';
import { useIdleStart } from './useIdleStart';
import { useTurntable } from './useTurntable';
import { ViewControls } from './ViewControls';

/** Giro máximo acompanhando o mouse, em radianos (~9°, ADR-0049). */
export const MAX_LEAN_RAD = 0.16;

const noSubscription = () => () => {};

/** Sinais do aparelho no navegador (só leitura, nada é guardado nem enviado). */
function deviceSignals(): DeviceSignals {
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  return {
    saveData: nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency || undefined,
  };
}

/**
 * Twin no início (9c, ADR-0049): o corpo é o destaque da tela, com o painel da região ao lado (ou embaixo no
 * celular). Carga sem "pulo": a mesma silhueta holográfica do carregamento aparece na hora, com o mesmo
 * enquadramento; a cena 3D entra depois, por baixo, e troca com o holograma só em `opacity` quando o modelo
 * está desenhado (instantâneo com menos movimento). Sem WebGL: o 2D interativo. No celular, o 3D carrega
 * sozinho quando o aparelho permite (`canAutoload3D`); senão, 2D e "Ver em 3D".
 * Modo privacidade (`hidden`): números ocultos (com dados próprios, as medidas nem chegam). Variação em tom
 * neutro, sem cor de bom ou ruim (LEG-M06). O peso não é região e não muda a forma.
 */
export function TwinHero({
  rows: inputRows,
  latestHeightCm: inputHeightCm,
  demo,
  hidden = false,
  href,
}: {
  rows: TwinRow[];
  latestHeightCm: number | null;
  demo: boolean;
  hidden?: boolean;
  href: Route;
}) {
  const t = useTranslations('twin.hero');
  const tb = useTranslations('twin.body');
  const td = useTranslations('disclaimer');
  const [model] = useBodyModel(demo);
  // Dados próprios com o modo privacidade ligado: forma de referência já no clique, antes de a tela recarregar
  // do servidor (que manda as linhas sem medidas, ADR-0035). Na demo, a forma fictícia continua.
  const hiddenNow = usePrivacyHiddenNow() || hidden;
  const referenceOnly = !demo && hiddenNow;
  const { rows, latestHeightCm } = useMemo(
    () =>
      referenceOnly
        ? { rows: withoutMeasures(inputRows), latestHeightCm: null }
        : demo && model
          ? demoTwinRows(inputRows, inputHeightCm, model)
          : { rows: inputRows, latestHeightCm: inputHeightCm },
    [referenceOnly, demo, inputRows, inputHeightCm, model],
  );
  const snapshot = useMemo(
    () => bodySnapshotAt(rows, '9999-12-31', latestHeightCm),
    [rows, latestHeightCm],
  );
  const shape = useMemo(() => bodyShape(snapshot), [snapshot]);
  const [selected, setSelected] = useState<BodyRegion>(
    () => BODY_REGION_ORDER.find((r) => snapshot.values[REGION_FIELD[r]] !== undefined) ?? 'waist',
  );
  const [hover, setHover] = useState<HoverInfo<BodyRegion> | null>(null);
  const clearHover = useCallback(() => setHover(null), []);
  const turntable = useTurntable(VIEW_ANGLE.front);
  const compact = useCompact();
  const fmt = useTwinFormat(hiddenNow);
  const level = (l: ConfidenceLevel): ConfidenceLevel => (demo ? 'DEMO' : l);
  const panelId = useId();

  // Quando o 3D entra: desktop com WebGL, sempre; toque, se o aparelho permitir ou a pessoa pedir.
  const support = useWebGLSupport();
  const coarse = useMediaQuery('(pointer: coarse)');
  const [asked3D, setAsked3D] = useState(false);
  const deviceAllows = useSyncExternalStore(
    noSubscription,
    () => canAutoload3D(deviceSignals()),
    () => true,
  );
  const autoload = !coarse || deviceAllows;
  const allow3D = support === 'yes' && (autoload || asked3D);
  const started = useIdleStart(allow3D);
  const [status, setStatus] = useState<BodySceneStatus>('loading');
  const ready = started && status !== 'loading' && status !== 'choose';

  // Giro leve acompanhando o mouse (sem toque, sem arrasto e sem menos movimento).
  const fine = useFinePointer();
  const { reduced } = useMotionPreference();
  const [lean, setLean] = useState(0);
  const frame = useRef(0);
  const leanEnabled = fine && !reduced;
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!leanEnabled || event.pointerType !== 'mouse' || event.buttons !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setLean((x - 0.5) * 2 * MAX_LEAN_RAD));
  };
  const resetLean = () => {
    cancelAnimationFrame(frame.current);
    setLean(0);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const angle = turntable.angle + (leanEnabled ? lean : 0);

  const regionName = (r: BodyRegion) => tb(`regions.${r}`);
  const regionLine = (r: BodyRegion) => {
    const m = snapshot.values[REGION_FIELD[r]];
    if (hidden) return tb('measure', { value: fmt.hiddenText });
    return m ? tb('measure', { value: fmt.value(m.value, 'cm') }) : tb('notInformed');
  };
  const silhouette = (
    <BodySilhouette2D shape={shape} angle={angle} selected={selected} onSelect={setSelected} />
  );

  return (
    <section
      aria-labelledby="twin-hero-title"
      data-tour="twin-hero"
      data-twin-hero-ready={ready ? '' : undefined}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="twin-hero-title" className="flex items-center gap-2 text-base font-semibold">
            <Orbit className="size-5 text-primary" aria-hidden="true" />
            {t('title')}
          </h2>
          {/* Modo privacidade com dados próprios: as medidas não chegam e o modelo fica na forma de referência. */}
          <p className="text-sm text-fg-muted">
            {t(referenceOnly ? 'subtitleReference' : 'subtitle')}
          </p>
        </div>
        <ConfidenceBadge level={level('INFORMADO')} />
      </div>
      <TwinHeroDisclaimer text={td('bodyModel')} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div
          className="flex flex-col gap-3"
          onPointerMove={onPointerMove}
          onPointerLeave={resetLean}
        >
          {model ? null : <BodyModelPrompt />}
          <TwinViewport<BodyRegion>
            label={t('title')}
            describedBy={panelId}
            hover={hover}
            onHoverEnd={clearHover}
            tooltip={(r) => (
              <>
                <span className="block font-semibold">{regionName(r)}</span>
                <span className="block">{regionLine(r)}</span>
              </>
            )}
            onDrag={turntable.drag}
            prefer2D={support === 'yes' && !allow3D}
            className="h-[min(62vh,640px)] min-h-[340px]"
            scene={(onFail) => (
              <div className="relative h-full w-full">
                {started ? (
                  <div
                    className={cn(
                      'absolute inset-0 transition-opacity duration-300',
                      ready ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    <LazyBodyScene
                      shape={shape}
                      model={model}
                      angle={angle}
                      instant={turntable.instant}
                      selected={selected}
                      onSelect={setSelected}
                      onHover={setHover}
                      onFail={onFail}
                      compact={compact}
                      onStatus={setStatus}
                    />
                  </div>
                ) : null}
                {/* Mesma silhueta do carregamento, por cima até o modelo estar desenhado. */}
                <div
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute inset-0 transition-opacity duration-300',
                    ready ? 'opacity-0' : 'opacity-100',
                  )}
                >
                  <HoloLoading reason={model ? 'loading' : 'choose'} pulse={false} />
                </div>
              </div>
            )}
            fallback={silhouette}
          />
          <ViewControls
            angle={turntable.angle}
            onAngle={turntable.turnTo}
            onReset={turntable.reset}
          />
          {support === 'yes' && !allow3D ? (
            <Button variant="secondary" className="self-start" onClick={() => setAsked3D(true)}>
              <Box className="size-4" aria-hidden="true" />
              {t('view3d')}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{tb('regionsTitle')}</h3>
          <ul className="flex flex-wrap gap-2">
            {BODY_REGION_ORDER.map((r) => (
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
                  {regionName(r)}
                </button>
              </li>
            ))}
          </ul>
          {/* Cartão curto ao lado do corpo, com inclinação (ADR-0048); o corpo gira acompanhando o mouse. */}
          <TiltCard
            id={panelId}
            aria-live="polite"
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-4 text-sm"
          >
            <HeroRegionPanel
              region={selected}
              rows={rows}
              snapshot={snapshot}
              name={regionName(selected)}
              hidden={hiddenNow}
              level={level}
            />
          </TiltCard>
          <Link href={href} prefetch={false} className={buttonClasses('secondary', 'self-start')}>
            {t('openFull')}
          </Link>
        </div>
      </div>
    </section>
  );
}

/** O mesmo aviso da tela do twin (`disclaimer.bodyModel`): representação aproximada, não é avaliação corporal. */
export function TwinHeroDisclaimer({ text }: { text: string }) {
  return (
    <p className="flex gap-2 text-sm text-fg-muted" data-testid="body-disclaimer">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      {text}
    </p>
  );
}

function HeroRegionPanel({
  region,
  rows,
  snapshot,
  name,
  hidden,
  level,
}: {
  region: BodyRegion;
  rows: TwinRow[];
  snapshot: BodySnapshot;
  name: string;
  hidden: boolean;
  level: (l: ConfidenceLevel) => ConfidenceLevel;
}) {
  const t = useTranslations('twin.body');
  const th = useTranslations('twin.hero');
  const fmt = useTwinFormat(hidden);
  const field = REGION_FIELD[region];
  const current = snapshot.values[field];
  const first = firstMeasure(rows, field);
  const delta =
    current && first && current.day !== first.day
      ? Math.round((current.value - first.value) * 10) / 10
      : null;
  const series = useMemo(
    () =>
      [...rows]
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((row) => ({ day: row.day, value: row[field] ?? null }))
        .filter((p) => p.value !== null),
    [rows, field],
  );

  if (hidden) {
    return (
      <>
        <p className="font-semibold">{name}</p>
        <p className="tabular">{t('measure', { value: fmt.hiddenText })}</p>
      </>
    );
  }
  if (!current) {
    return (
      <>
        <p className="font-semibold">{name}</p>
        <p>{t('notInformed')}</p>
      </>
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{name}</p>
        <ConfidenceBadge level={level('INFORMADO')} />
      </div>
      <p className="tabular text-2xl font-bold">{fmt.value(current.value, 'cm')}</p>
      <p className="text-fg-muted">
        {current.day ? t('recordedOn', { date: fmt.longDay(current.day) }) : t('beforePeriod')}
      </p>
      {delta !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="tabular">{t('change', { delta: fmt.signed(delta, 'cm') })}</p>
          <ConfidenceBadge level={level('ESTIMADO')} />
        </div>
      ) : null}
      {series.length > 1 ? (
        <>
          <Sparkline data={series} color="var(--hm-chart-1)" minSpan={4} />
          <p className="text-xs text-fg-muted">{th('sparkline', { count: series.length })}</p>
        </>
      ) : null}
    </>
  );
}
