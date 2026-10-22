'use client';

import { useRef, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useFinePointer, useMotionPreference } from '@/lib/motion/motion';

/** Inclinação máxima, em graus, no canto do cartão (ADR-0048). */
export const MAX_TILT_DEG = 6;

/**
 * Inclinação e brilho no ponto do cursor (normalizado de 0 a 1 em cada eixo): no centro o cartão fica
 * reto; nas bordas, inclina até `max` graus na direção do cursor.
 */
export function tiltFor(x: number, y: number, max = MAX_TILT_DEG): { rx: number; ry: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { rx: (0.5 - clamp(y)) * 2 * max, ry: (clamp(x) - 0.5) * 2 * max };
}

/**
 * Cartão curto de destaque com inclinação leve e brilho azul que segue o cursor (ADR-0048). Só com mouse
 * ou trackpad (`pointer: fine`), e desligado com `prefers-reduced-motion` ou com a opção "Reduzir
 * animações": aí é um cartão comum. Anima só `transform` e `opacity`, direto no estilo do elemento (sem
 * renderizar de novo), num quadro por movimento. O brilho é decorativo (`aria-hidden`) e não captura o
 * ponteiro; o conteúdo, os links e o foco do cartão não mudam.
 */
export function TiltCard({
  children,
  className,
  as: Tag = 'div',
  id,
  'aria-live': ariaLive,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section';
  id?: string;
  'aria-live'?: 'polite';
}) {
  const fine = useFinePointer();
  const { reduced } = useMotionPreference();
  const enabled = fine && !reduced;
  const ref = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLSpanElement>(null);
  const frame = useRef(0);

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse') return;
    const el = ref.current;
    const glow = glowRef.current;
    if (!el || !glow) return;
    const box = el.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const { rx, ry } = tiltFor(px / box.width, py / box.height);
      el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      glow.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
      glow.style.opacity = '1';
    });
  }

  function onPointerLeave() {
    cancelAnimationFrame(frame.current);
    if (ref.current) ref.current.style.transform = '';
    if (glowRef.current) glowRef.current.style.opacity = '0';
  }

  return (
    <Tag
      ref={ref as never}
      id={id}
      aria-live={ariaLive}
      data-tilt={enabled ? '' : undefined}
      onPointerMove={enabled ? onPointerMove : undefined}
      onPointerLeave={enabled ? onPointerLeave : undefined}
      className={cn(
        // `isolate` + brilho em `-z-10`: o brilho fica acima do fundo do cartão e abaixo do texto.
        'relative isolate',
        enabled && 'transition-transform duration-200 ease-out will-change-transform',
        className,
      )}
    >
      {enabled ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
        >
          <span
            ref={glowRef}
            className="absolute top-0 left-0 size-64 rounded-full bg-[radial-gradient(circle,var(--hm-tilt-glow)_0%,transparent_65%)] opacity-0 transition-opacity duration-300"
          />
        </span>
      ) : null}
      {children}
    </Tag>
  );
}
