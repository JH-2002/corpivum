import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import localFont from 'next/font/local';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { shellMessages } from '@/i18n/client-messages';
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Toda página é renderizada sob demanda: o Next só aplica o nonce da CSP (ADR-0006, gerado no proxy) em
  // renderização dinâmica, e as páginas leem o ambiente na requisição, não no build. Antes isso vinha da leitura
  // de `headers()` para o script de tema, que saiu com o tema único (ADR-0046).
  await connection();
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        {/* Só as mensagens do shell vão ao navegador; cada página acrescenta as suas (withRouteMessages, ADR-0052).
            No modo só demo, nunca os textos jurídicos (ADR-0044). */}
        <NextIntlClientProvider messages={shellMessages(isDemoOnly())}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
