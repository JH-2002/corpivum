'use client';

import { useReducedMotion } from '@/lib/motion/motion';

/**
 * Gráficos, tour e twin sem animação (WCAG 2.3.3): `prefers-reduced-motion` do sistema ou a opção "Reduzir
 * animações" do app (9f, ADR-0055; antes só o sistema). No servidor, assume reduzido.
 */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion();
}
