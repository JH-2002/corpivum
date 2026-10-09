'use client';

import { useState } from 'react';
import { usePrefersReducedMotion } from '@/components/charts/reduced-motion';
import { closestAngle } from './layout';

/**
 * Rotação do modelo (§15): vistas e botões giram com transição curta; arrasto e
 * `prefers-reduced-motion` aplicam direto (WCAG 2.3.3). Sem giro automático nem inércia.
 */
export function useTurntable(initial = 0) {
  const reduced = usePrefersReducedMotion();
  const [angle, setAngle] = useState(initial);
  const [dragging, setDragging] = useState(false);
  return {
    angle,
    instant: reduced || dragging,
    /** Vai para o ângulo (vista ou passo dos botões) pelo caminho mais curto. */
    turnTo: (target: number) => {
      setDragging(false);
      setAngle((current) => closestAngle(current, target));
    },
    drag: (delta: number) => {
      setDragging(true);
      setAngle((current) => current + delta);
    },
    reset: () => {
      setDragging(false);
      setAngle((current) => closestAngle(current, initial));
    },
  };
}
