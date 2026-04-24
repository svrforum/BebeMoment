import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV !== 'production',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: '../..',
  transpilePackages: [
    '@bebe/config',
    '@bebe/core',
    '@bebe/db-public',
    '@bebe/db-media',
    '@bebe/storage',
  ],
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  images: { unoptimized: true },
}

export default withSerwist(nextConfig)
