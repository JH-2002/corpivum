import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { DemoOnlyProvider } from '@/components/demo/DemoOnlyContext';
import { isDemoOnly } from '@/lib/demo-mode';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  const suffix = `${t('demo.title')} · ${t('common.appName')}`;
  // Demonstração pública: não indexar (dados fictícios, sem valor de busca).
  return {
    title: { template: `%s · ${suffix}`, default: suffix },
    robots: { index: false },
  };
}

/**
 * Demo público sem login (LEG-X02, ADR-0021). O shell (sidebar, header, navegação) fica em `(shell)`; o
 * modo apresentação (`/demo/apresentacao`, ADR-0035) ocupa a tela inteira, sem ele.
 */
export default function DemoLayout({ children }: { children: ReactNode }) {
  // Modo só demo (ADR-0043): os componentes de cliente escondem o cadastro e os links do app completo.
  return <DemoOnlyProvider value={isDemoOnly()}>{children}</DemoOnlyProvider>;
}
