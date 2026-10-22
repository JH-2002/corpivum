'use client';

import { useTranslations } from 'next-intl';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/components/charts/reduced-motion';
import { useWebGLSupport } from './hooks';
import { SceneLoading } from './LazyScenes';
import type { HoverInfo } from './types';

/** Erro ao montar a cena 3D (ex.: driver recusou o contexto): troca para a versão 2D. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    // Sem log de conteúdo (LEG-R04): a troca para 2D já informa a pessoa.
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Pixels de arrasto por radiano de rotação. */
const DRAG_PX_PER_RAD = 120;

/**
 * Área do modelo (§15, §17, ADR-0026): 3D quando há WebGL, 2D quando não há ou quando o 3D falha.
 * Arrastar gira (sem inércia); o tooltip de região acompanha o ponteiro e fecha com Esc (WCAG 1.4.13).
 * O desenho é decorativo para leitor de tela: a mesma informação está na lista de regiões, no painel e
 * no resumo em texto (`describedBy`).
 */
export function TwinViewport<R extends string>({
  label,
  describedBy,
  hover,
  onHoverEnd,
  tooltip,
  onDrag,
  scene,
  fallback,
  prefer2D = false,
  className = 'h-[360px] sm:h-[460px]',
}: {
  label: string;
  describedBy?: string;
  hover: HoverInfo<R> | null;
  onHoverEnd: () => void;
  tooltip: (region: R) => ReactNode;
  onDrag: (radians: number) => void;
  scene: (onFail: () => void) => ReactNode;
  fallback: ReactNode;
  /** Mostra o 2D mesmo com WebGL (celular que não carrega o 3D sozinho, ADR-0049). */
  prefer2D?: boolean;
  className?: string;
}) {
  const t = useTranslations('twin.viewer');
  const support = useWebGLSupport();
  const [failed, setFailed] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);
  const lastX = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const use3D = support === 'yes' && !failed && !prefer2D;

  useEffect(() => {
    if (!hover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onHoverEnd();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hover, onHoverEnd]);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={label}
        aria-describedby={describedBy}
        data-twin-mode={support === 'pending' ? 'pending' : use3D ? '3d' : '2d'}
        data-holo-animated={use3D && !reduced}
        className={`relative w-full cursor-grab touch-pan-y overflow-hidden rounded-lg border border-border bg-surface select-none active:cursor-grabbing ${className}`}
        onPointerEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setBox({ left: r.left, top: r.top, width: r.width });
        }}
        onPointerDown={(e) => {
          lastX.current = e.clientX;
        }}
        onPointerMove={(e) => {
          if (lastX.current === null || (e.buttons & 1) === 0) return;
          const dx = e.clientX - lastX.current;
          lastX.current = e.clientX;
          if (dx !== 0) onDrag(dx / DRAG_PX_PER_RAD);
        }}
        onPointerUp={() => {
          lastX.current = null;
        }}
        onPointerLeave={() => {
          lastX.current = null;
          onHoverEnd();
        }}
      >
        {support === 'pending' ? (
          <SceneLoading />
        ) : use3D ? (
          <SceneBoundary onError={() => setFailed(true)}>
            {scene(() => setFailed(true))}
          </SceneBoundary>
        ) : (
          fallback
        )}
        {hover && box ? (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 max-w-56 rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-md"
            style={{
              left: Math.max(8, Math.min(hover.clientX - box.left + 12, box.width - 200)),
              top: Math.max(hover.clientY - box.top - 12, 8),
            }}
          >
            {tooltip(hover.region)}
          </div>
        ) : null}
      </div>
      <p className="text-sm text-fg-muted">{use3D ? t('dragHint') : null}</p>
      {support === 'no' || failed ? (
        <p className="text-sm text-fg-muted" data-testid="twin-fallback-notice">
          {t('fallback')}
        </p>
      ) : null}
    </div>
  );
}
