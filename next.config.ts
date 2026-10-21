import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Cabeçalhos de segurança em todas as respostas (LEG-S01, LEG-S05). A CSP tem nonce por requisição e fica
 * em src/proxy.ts. HSTS é ignorado pelos navegadores em http://localhost, então pode ir sempre.
 */
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), ' +
      'accelerometer=(), gyroscope=(), magnetometer=(), browsing-topics=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

// Rotas removidas (ADR-0027, ADR-0030): redirecionadas no proxy (src/proxy.ts), com CSP e `no-store` (TM-02).

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Modelos 3D com hash no nome (ADR-0028): o conteúdo de um nome nunca muda.
      {
        source: '/models/:file([a-z0-9-]+\\.[0-9a-f]+\\.glb)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // Imagens da marca (ADR-0045): nome sem hash, então cache de 1 dia, revalidando em segundo plano.
      {
        source: '/brand/:file(corpivum-[a-z]+-[0-9]+\\.(?:webp|png))',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
    ];
  },
  reactStrictMode: true,
  typedRoutes: true,
};

export default withNextIntl(nextConfig);
