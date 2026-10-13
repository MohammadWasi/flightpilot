import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  transpilePackages: [
    '@flightpilot/core',
    '@flightpilot/shared',
    '@flightpilot/providers',
    '@flightpilot/pricing-engine',
  ],
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default nextConfig;
