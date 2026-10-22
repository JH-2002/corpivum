import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

/**
 * Estado de espera do twin no estilo holograma (ADR-0028, revisão de carregamento): silhueta suave com as
 * cores `--hm-holo-*`, pulsando devagar; parada com `prefers-reduced-motion`. Não é o corpo da pessoa nem o
 * corpo gerado em código: só um contorno genérico. Fica por cima do canvas, sem capturar o ponteiro.
 * `reason`: carregando (chunk 3D ou modelo `.glb`) ou aguardando a escolha do modelo. `pulse={false}`: parada,
 * como no twin do início (ADR-0049): a pulsação desde o primeiro quadro custava ~200 ms no "interativo" com a CPU
 * lenta.
 */
export function HoloLoading({
  reason = 'loading',
  pulse = true,
}: {
  reason?: 'loading' | 'choose';
  pulse?: boolean;
}) {
  const t = useTranslations('twin.viewer');
  return (
    <div
      data-testid="twin-holo-loading"
      data-reason={reason}
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-4"
    >
      <svg
        viewBox="0 0 60 160"
        aria-hidden
        className={cn('h-3/5 max-h-72', pulse && 'animate-pulse motion-reduce:animate-none')}
      >
        <g
          fill="var(--hm-holo-fill)"
          fillOpacity="0.14"
          stroke="var(--hm-holo-rim)"
          strokeOpacity="0.55"
          strokeWidth="1.2"
        >
          <ellipse cx="30" cy="14" rx="9" ry="11" />
          <path d="M30 27c-11 0-18 5-19 14l-4 34c-1 4 4 5 5 1l5-28 1 33-2 69c0 5 7 5 7 0l5-55h4l5 55c0 5 7 5 7 0l-2-69 1-33 5 28c1 4 6 3 5-1l-4-34c-1-9-8-14-19-14z" />
        </g>
      </svg>
      <p className="rounded-md bg-surface/80 px-3 py-1 text-sm text-fg-muted">
        {t(reason === 'choose' ? 'choose' : 'loading')}
      </p>
    </div>
  );
}
