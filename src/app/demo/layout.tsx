import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('demo');
  // Demonstração pública: não indexar (dados fictícios, sem valor de busca).
  return {
    title: { template: `%s · ${t('title')}`, default: t('title') },
    robots: { index: false },
  };
}

/**
 * Demo público sem login (LEG-X02, ADR-0021). O shell (sidebar, header, navegação) fica em `(shell)`; o
 * modo apresentação (`/demo/apresentacao`, ADR-0035) ocupa a tela inteira, sem ele.
 */
export default function DemoLayout({ children }: { children: ReactNode }) {
  return children;
}
