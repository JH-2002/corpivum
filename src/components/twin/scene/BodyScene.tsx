'use client';

import { useThree } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Vector2 } from 'three';
import { BODY_ASSETS } from '@/modules/twin/bodyAssets';
import type { BodyRegion } from '@/modules/twin';
import { HoloLoading } from '../HoloLoading';
import { bodyLayout, type ProfilePoint } from '../layout';
import type { BodySceneProps, BodySceneStatus } from '../types';
import { bodyModelArrived, preloadAllBodyModels } from './assets';
import { BodyModelMesh } from './BodyModelMesh';
import { CameraFit, cameraDistanceFor, regionHandlers, TwinCanvas, Turntable } from './common';
import { HologramMaterial, regionHoloState, useHoloTheme } from './Hologram';

const toVectors = (points: readonly ProfilePoint[]) => points.map(([r, y]) => new Vector2(r, y));

/**
 * Tempo máximo de espera pela REDE do modelo `.glb` antes de mostrar o corpo em código (ADR-0028). Arquivo
 * recebido, a decodificação segue sem prazo: falha dela cai no fallback pelo erro, não pelo tempo.
 */
export const MODEL_LOAD_TIMEOUT_MS = 10_000;
/** Tempo para o navegador restaurar um contexto WebGL perdido; sem restauração, a tela vai para 2D. */
export const CONTEXT_RESTORE_TIMEOUT_MS = 3_000;

/** `.glb` que falhou (rede, decodificação): avisa a cena, que mostra o corpo em código. */
class ModelBoundary extends Component<{
  fallback: ReactNode;
  onError: () => void;
  children: ReactNode;
}> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    // Sem log de conteúdo (LEG-R04): o corpo em código já é a resposta visível.
    this.props.onError();
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type ModelStatus = 'loading' | 'ready' | 'error' | 'timeout';

/**
 * Corpo 3D (§15, ADR-0026, ADR-0028): o modelo `.glb` da variante escolhida, com morphs calibrados pelas
 * medidas informadas. Nenhuma cor vem de dado.
 * - Enquanto o modelo carrega (ou antes da escolha da variante): só o estado de espera em holograma
 *   (`HoloLoading`), nunca o corpo gerado em código.
 * - O corpo em código é só fallback real: erro ao carregar, `MODEL_LOAD_TIMEOUT_MS` sem resposta (se o
 *   modelo chegar depois, ele assume), contexto WebGL perdido e restaurado, ou variante sem arquivo.
 *   Contexto perdido e não restaurado em `CONTEXT_RESTORE_TIMEOUT_MS`: `onFail` (versão 2D).
 */
export function BodyScene(props: BodySceneProps) {
  const { model, angle, instant, compact, onFail, onStatus } = props;
  const asset = model ? BODY_ASSETS[model] : undefined;
  const file = asset?.file ?? null;
  const [state, setState] = useState<{ file: string | null; status: ModelStatus }>({
    file,
    status: 'loading',
  });
  const status: ModelStatus = state.file === file ? state.status : 'loading';
  const [context, setContext] = useState<'ok' | 'lost' | 'restored'>('ok');
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markReady = useCallback(() => setState({ file, status: 'ready' }), [file]);
  const markError = useCallback(() => setState({ file, status: 'error' }), [file]);

  // Mesmo pedido da pré-carga da tela (cache por arquivo); garante os dois modelos também aqui.
  useEffect(() => preloadAllBodyModels(), []);

  useEffect(() => {
    if (!asset || status !== 'loading') return;
    const timer = setTimeout(
      () =>
        setState((s) =>
          s.file === asset.file && s.status === 'ready'
            ? s
            : { file: asset.file, status: 'timeout' },
        ),
      MODEL_LOAD_TIMEOUT_MS,
    );
    // Chegou pela rede: sem tempo limite (a falha, se houver, vem pelo `ModelBoundary`).
    bodyModelArrived(asset).then(
      () => clearTimeout(timer),
      () => undefined,
    );
    return () => clearTimeout(timer);
  }, [asset, status]);

  useEffect(
    () => () => {
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
    },
    [],
  );

  const onContextLost = useCallback(() => {
    setContext('lost');
    restoreTimer.current = setTimeout(onFail, CONTEXT_RESTORE_TIMEOUT_MS);
  }, [onFail]);
  const onContextRestored = useCallback(() => {
    if (restoreTimer.current) clearTimeout(restoreTimer.current);
    setContext('restored');
  }, []);

  const code = <CodeBody {...props} />;
  let content: ReactNode = null;
  if (context === 'restored' || (model && !asset)) {
    content = code;
  } else if (asset && context === 'ok') {
    content = (
      <ModelBoundary key={asset.file} fallback={code} onError={markError}>
        <Suspense fallback={status === 'timeout' ? code : null}>
          <BodyModelMesh {...props} asset={asset} onReady={markReady} />
        </Suspense>
      </ModelBoundary>
    );
  }
  const waiting = context === 'ok' && (!model || (asset !== undefined && status === 'loading'));
  // Corpo em código no lugar do modelo (contexto restaurado ou variante sem arquivo) também conta como pronto.
  const shown: BodySceneStatus = !model
    ? 'choose'
    : context === 'restored' || !asset
      ? 'error'
      : status;
  useEffect(() => onStatus?.(shown), [shown, onStatus]);

  return (
    <div className="relative h-full w-full" data-twin-status={!model ? 'choose' : status}>
      <TwinCanvas
        compact={compact}
        cameraZ={cameraDistanceFor(props.shape.heightM)}
        onContextLost={onContextLost}
        onContextRestored={onContextRestored}
      >
        <CameraFit heightM={props.shape.heightM} />
        <Turntable angle={angle} instant={instant}>
          {content}
        </Turntable>
      </TwinCanvas>
      {waiting ? <HoloLoading reason={model ? 'loading' : 'choose'} /> : null}
    </div>
  );
}

/**
 * Manequim paramétrico gerado em código (Fase 3): a forma vem só das medidas informadas; regiões sem
 * medida ficam na forma neutra, mais transparentes; o destaque marca só a região escolhida.
 */
function CodeBody(props: BodySceneProps) {
  const { shape, selected, compact } = props;
  const layout = useMemo(() => bodyLayout(shape), [shape]);
  const theme = useHoloTheme();
  const segments = compact ? 24 : 48;
  const get = useThree((s) => s.get);
  useLayoutEffect(() => {
    // Marca para o e2e saber o que está desenhado (sem dado da pessoa).
    get().gl.domElement.dataset.twinModel = 'geometry';
  }, [get]);

  const material = (region: BodyRegion | null) => (
    <HologramMaterial theme={theme} state={regionHoloState(region, selected, shape.missing)} />
  );
  const handlers = (region: BodyRegion) => regionHandlers(region, props);
  const legHeight = layout.leg.top - layout.leg.bottom;
  const legY = (layout.leg.top + layout.leg.bottom) / 2;

  return (
    <group position={[0, -layout.height / 2, 0]}>
      {(['hip', 'waist', 'chest'] as const).map((band) => (
        <mesh key={band} scale={[1, 1, layout.depth]} {...handlers(band)}>
          <latheGeometry args={[toVectors(layout.torso[band]), segments]} />
          {material(band)}
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`leg${side}`} position={[side * layout.leg.x, legY, 0]} {...handlers('thigh')}>
          <cylinderGeometry args={[layout.leg.rTop, layout.leg.rBottom, legHeight, segments / 2]} />
          {material('thigh')}
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={`arm${side}`}
          position={[
            side * (layout.arm.x + Math.sin(layout.arm.tilt) * (layout.arm.length / 2)),
            layout.arm.top - layout.arm.length / 2,
            0,
          ]}
          rotation={[0, 0, side * layout.arm.tilt]}
          {...handlers('arm')}
        >
          <capsuleGeometry args={[layout.arm.r, layout.arm.length, 6, segments / 2]} />
          {material('arm')}
        </mesh>
      ))}
      <mesh position={[0, (layout.neck.bottom + layout.neck.top) / 2, 0]}>
        <cylinderGeometry
          args={[layout.neck.r, layout.neck.r, layout.neck.top - layout.neck.bottom, 16]}
        />
        {material(null)}
      </mesh>
      <mesh position={[0, layout.head.y, 0]} scale={[0.85, 1, 0.95]}>
        <sphereGeometry args={[layout.head.r, segments / 2, segments / 2]} />
        {material(null)}
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`foot${side}`}
          position={[side * layout.leg.x, layout.leg.bottom * 0.6, layout.leg.rBottom]}
          scale={[1, 0.6, 2]}
        >
          <sphereGeometry args={[layout.leg.rBottom * 1.1, 12, 12]} />
          {material(null)}
        </mesh>
      ))}
    </group>
  );
}
