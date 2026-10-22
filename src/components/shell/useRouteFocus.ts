'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type RefObject } from 'react';
import { focusProgrammatically, trackInputModality } from '@/components/ui/programmatic-focus';

/**
 * Na troca de rota pelo cliente, o foco vai ao título da página (9b, WCAG 2.4.3): quem usa teclado ou leitor de
 * tela continua do conteúdo novo, e não do link clicado. A primeira carga não mexe no foco (o navegador já
 * começa do topo), e um diálogo aberto (ex.: o registro rápido, que leva o foco ao formulário) tem prioridade.
 * Sem moldura depois de clique ou toque (`focusProgrammatically`).
 */
export function useRouteFocus(target: RefObject<HTMLElement | null>): void {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    trackInputModality();
  }, []);

  useEffect(() => {
    if (previous.current === null || previous.current === pathname) {
      previous.current = pathname;
      return;
    }
    previous.current = pathname;
    if (document.querySelector('dialog[open]')) return;
    focusProgrammatically(target.current, { preventScroll: true });
  }, [pathname, target]);
}
