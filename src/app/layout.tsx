import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { demoClientMessages } from '@/i18n/messages';
import { isDemoOnly } from '@/lib/demo-mode';
import '@/styles/globals.css';

// Inter variável auto-hospedada (OFL 1.1; ADR-0046), reduzida ao latino e ao peso 400–700 (27,6 KiB): servida pelo
// próprio site, como exige a CSP (`font-src 'self'`). O next/font faz o preload e ajusta as métricas da fonte de
// reserva. `optional`: se a fonte não chegar a tempo na primeira visita, a página fica com a de reserva em vez de
// trocar no meio da carga (a troca custava ~150 ms no "interativo" medido); da visita seguinte em diante, do cache.
const inter = localFont({
  src: './fonts/inter-latin-400-700.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'optional',
  variable: '--font-inter',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return {
    title: { default: t('appName'), template: `%s · ${t('appName')}` },
    description: t('tagline'),
    // Área logada: não indexar.
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Tema único escuro (ADR-0046): mesma cor de --hm-bg.
  themeColor: '#0b1118',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        {/* Modo só demo (ADR-0044): o navegador não recebe os textos jurídicos do app completo. */}
        <NextIntlClientProvider messages={isDemoOnly() ? demoClientMessages() : undefined}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
