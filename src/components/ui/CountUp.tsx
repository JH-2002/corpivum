'use client';

import { useEffect, useRef } from 'react';
import { formatDuration } from '@/components/health/format';
import { useReducedMotion } from '@/lib/motion/motion';

/** Duração da contagem (9f, ADR-0055). */
export const COUNT_UP_MS = 800;

export type CountUpFormat = 'integer' | 'percent' | 'duration';

export function formatCount(value: number, format: CountUpFormat): string {
  if (format === 'duration') return formatDuration(value);
  const n = Math.round(value);
  return format === 'percent' ? `${n}%` : String(n);
}

/**
 * Número que conta de 0 até o valor quando entra na tela (9f, ADR-0055). Só para indicadores de rotina (Índice,
 * sono, hábitos); nunca peso, medidas nem alimentação (LEG-M06/M07).
 * - O HTML do servidor já traz o valor final: a primeira pintura e o LCP não mudam.
 * - Se o número já está visível quando a página fica interativa, não anima (não troca o que já foi pintado).
 * - O valor final continua no DOM o tempo todo (só fica transparente durante a contagem, reservando a largura): é
 *   ele que o leitor de tela lê. Os números intermediários vão num elemento `aria-hidden`, sem `aria-live`.
 * - Com "Reduzir animações" ou sem IntersectionObserver, mostra o valor final direto.
 */
export function CountUp({ value, format = 'integer' }: { value: number; format?: CountUpFormat }) {
  const reduced = useReducedMotion();
  const finalRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const final = finalRef.current;
    const count = countRef.current;
    if (!final || !count) return;
    const stop = () => {
      final.style.opacity = '';
      count.textContent = '';
    };
    if (reduced || typeof IntersectionObserver === 'undefined') return;
    let frame = 0;
    let first = true;
    // A primeira resposta do observador diz se o número já está na tela, sem ler a caixa na hidratação (o que
    // forçaria um cálculo de layout por número). Fora da tela, troca pelo 0 sem ninguém ver e conta ao entrar.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (first) {
          first = false;
          if (visible) {
            observer.disconnect();
            return;
          }
          final.style.opacity = '0';
          count.textContent = formatCount(0, format);
          return;
        }
        if (!visible) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / COUNT_UP_MS);
          if (p >= 1) {
            stop();
            return;
          }
          count.textContent = formatCount(value * (1 - (1 - p) ** 3), format);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(final);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      stop();
    };
  }, [reduced, value, format]);

  return (
    <span className="relative inline-block" data-count-up="">
      <span ref={finalRef}>{formatCount(value, format)}</span>
      <span ref={countRef} aria-hidden="true" className="absolute top-0 left-0 whitespace-nowrap" />
    </span>
  );
}
