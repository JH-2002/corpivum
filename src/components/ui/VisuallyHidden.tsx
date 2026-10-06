import type { ReactNode } from 'react';

/** Conteúdo só para leitores de tela. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
