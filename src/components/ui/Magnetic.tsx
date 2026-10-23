'use client';

import { useRef, type PointerEvent, type ReactNode } from 'react';
import { useFinePointer, useReducedMotion } from '@/lib/motion/motion';

/** Deslocamento máximo, em px, na direção do cursor (9f, ADR-0055). */
export const MAGNETIC_MAX_PX = 4;

/**
 * Botão "magnético" (9f, ADR-0055): o desenho acompanha um pouco o cursor dentro do botão. Só com mouse ou
 * trackpad e sem "Reduzir animações"; em toque, é o botão comum. O contêiner de fora não se move, e o deslocamento
 * é pequeno e na direção do cursor, então a área de clique continua sob o ponteiro. Usado só no Registrar do topo.
 */
export function Magnetic({ children }: { children: ReactNode }) {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const enabled = fine && !reduced;
  const inner = useRef<HTMLSpanElement>(null);
  const frame = useRef(0);

  function onPointerMove(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType !== 'mouse') return;
    const box = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - box.left) / box.width - 0.5;
    const dy = (event.clientY - box.top) / box.height - 0.5;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (inner.current) {
        inner.current.style.transform = `translate(${(dx * 2 * MAGNETIC_MAX_PX).toFixed(1)}px, ${(dy * 2 * MAGNETIC_MAX_PX).toFixed(1)}px)`;
      }
    });
  }

  function onPointerLeave() {
    cancelAnimationFrame(frame.current);
    if (inner.current) inner.current.style.transform = '';
  }

  return (
    <span
      className="inline-flex"
      data-magnetic={enabled ? '' : undefined}
      onPointerMove={enabled ? onPointerMove : undefined}
      onPointerLeave={enabled ? onPointerLeave : undefined}
    >
      <span ref={inner} className="inline-flex transition-transform duration-200 ease-out">
        {children}
      </span>
    </span>
  );
}
