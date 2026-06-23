import path from 'node:path'
import createNextIntlPlugin from 'next-intl/plugin'

// 라우팅 없는 쿠키 기반 i18n — 메시지/로케일은 src/i18n/request.ts 에서 해석.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// 모노레포 루트 = 이 설정 파일(apps/web) 기준 ../.. — 호스트(/opt/stacks/bebe-moment)와
// Docker(/repo) 양쪽에서 올바르게 해석된다. 절대경로 하드코딩은 컨테이너 빌드에서
// Turbopack "distDirRoot navigates out of projectPath" 로 깨진다.
const repoRoot = path.join(import.meta.dirname, '..', '..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  transpilePackages: ['@bebe/config', '@bebe/core', '@bebe/db-public', '@bebe/db-media'],
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
    // Tree-shake barrel imports of icon/util libraries so only the actually
    // referenced exports land in client bundles. lucide-react ships ~1000
    // icons via a barrel (`export * from ...`); without this, even importing
    // 5 icons can drag in the full set into a route's client bundle.
    optimizePackageImports: ['lucide-react'],
  },
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
  // 보안 응답 헤더. 셀프호스팅(LAN/http 포함)을 깨지 않는 보수적 기본값.
  // CSP: 모든 리소스를 같은 오리진으로 묶고(default-src 'self') 미디어·blurhash·폰트만
  // 예외(data:/blob:). script/style 은 Next 16 의 인라인 부트스트랩·framer 인라인 스타일
  // 때문에 'unsafe-inline' 을 허용한다(인라인 주입은 못 막지만, 외부 스크립트 로드·
  // object/base-uri/connect 등은 차단 — 라이브 브라우저 검증 완료). nonce 기반 strict CSP 는
  // 추후 별도 작업.
  async headers() {
    const isHttps = (process.env.PUBLIC_URL ?? '').startsWith('https://')
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ].join('; ')
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
          ...(isHttps
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
            : []),
        ],
      },
    ]
  },
}

// Next 16 fixes the not-found prerender regression (vercel/next.js#85668)
// that forced --experimental-build-mode=compile on 15.5, so the standard
// `next build` (Turbopack) now runs the full static-generation pipeline and
// `output: 'standalone'` is re-enabled.
//
// @serwist/next stays DISABLED: in Next 16 Turbopack is the default builder
// and @serwist/next's withSerwistInit injects a webpack config Turbopack
// rejects ("build is using Turbopack, with a `webpack` config"). The serwist
// worker source (app/sw.ts) is preserved for a future migration to
// @serwist/turbopack / configurator mode. Push + PWA install still work via
// the hand-written public/push-sw.js (registered in src/lib/push-client.ts),
// which is independent of serwist.

export default withNextIntl(nextConfig)
