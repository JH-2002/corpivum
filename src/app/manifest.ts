import type { MetadataRoute } from 'next';
import { PRODUCT_NAME, PRODUCT_SLUG } from '@/config/product';
import { isDemoOnly } from '@/lib/demo-mode';

/**
 * Manifest do app (ADR-0045). Ícones: o favicon aprovado ("C" + ponto, sem a figura), exportado por
 * `scripts/brand/exportar-logo.mjs`. Cores do tema único escuro (ADR-0046).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    start_url: isDemoOnly() ? '/demo' : '/inicio',
    display: 'standalone',
    background_color: '#0b1118',
    theme_color: '#0b1118',
    lang: 'pt-BR',
    icons: [
      { src: `/brand/${PRODUCT_SLUG}-icone-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `/brand/${PRODUCT_SLUG}-icone-512.png`, sizes: '512x512', type: 'image/png' },
    ],
  };
}
