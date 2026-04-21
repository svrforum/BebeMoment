/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@bebe/config', '@bebe/core', '@bebe/db', '@bebe/storage'],
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  images: { unoptimized: true },
}
export default nextConfig
