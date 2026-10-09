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

/**
 * Rotas removidas na reorientação (ADR-0027): links salvos levam à tela inicial em vez de um 404.
 * Temporário (307), não permanente: o navegador não guarda o redirecionamento se a rota voltar a existir.
 */
const REMOVED_ROUTES = [
  { source: '/humor', destination: '/inicio' },
  { source: '/diario', destination: '/inicio' },
  { source: '/medicamentos', destination: '/inicio' },
  { source: '/twin/cerebro', destination: '/twin' },
  { source: '/demo/humor', destination: '/demo' },
  { source: '/demo/diario', destination: '/demo' },
  { source: '/demo/twin/cerebro', destination: '/demo/twin' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Modelos 3D com hash no nome (ADR-0028): o conteúdo de um nome nunca muda.
      {
        source: '/models/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
  async redirects() {
    return REMOVED_ROUTES.map((route) => ({ ...route, permanent: false }));
  },
  reactStrictMode: true,
  typedRoutes: true,
};

export default withNextIntl(nextConfig);
