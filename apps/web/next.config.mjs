/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `output: 'standalone'` is incompatible with --experimental-build-mode=
  // compile (standalone packaging is skipped). Until the prerender bug is
  // fixed and we can drop compile mode, the Docker image just `next start`s
  // the full built tree (see docker/web.Dockerfile).
  outputFileTracingRoot: '/opt/stacks/bebe-moment',
  transpilePackages: [
    '@bebe/config',
    '@bebe/core',
    '@bebe/db-public',
    '@bebe/db-media',
    '@bebe/storage',
  ],
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  images: { unoptimized: true },
  // When the deployment doesn't run Caddy (e.g. local Docker container
  // pointing at host networking), proxy `/media/*` straight through to
  // the media service. Browser requests stay same-origin, SSE streams
  // pass through cleanly. Set MEDIA_INTERNAL_URL to e.g. http://localhost:3001
  // to enable; leave unset to disable (Caddy/compose handles routing).
  async rewrites() {
    const target = process.env.MEDIA_INTERNAL_URL
    if (!target) return []
    return [{ source: '/media/:path*', destination: `${target}/media/:path*` }]
  },
}

// Note on the build pipeline: bebe-moment is fully auth-gated and every
// route is server-rendered on demand (no static prerender). Under Next
// 15.5 the static-export pipeline crashes on the synthesized Pages
// Router /404 and /500 with "<Html> outside pages/_document" — a known
// regression triggered when an App Router project also has a not-found.
// The package.json build script uses --experimental-build-mode=compile
// which skips the static-generation phase entirely. `next start` still
// serves every dynamic page correctly. Re-enable full build once Next
// fixes the regression (tracked at vercel/next.js#85668).
//
// @serwist/next is intentionally NOT wrapped here. Same upstream issue.
// PWA can be re-enabled once the Pages Router fallback bug is fixed.

export default nextConfig
