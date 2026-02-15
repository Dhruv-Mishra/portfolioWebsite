import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for minimal server footprint (~50MB vs ~150MB) — critical for 1GB RAM VMs
  output: 'standalone',
  images: {
    // Enable Next.js image optimization (sharp) for responsive srcset, AVIF, lazy placeholders
    // Removed `unoptimized: true` — build-time optimization is viable even on 1-vCPU
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 828, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  // Optimize bundle
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ["error", "warn"],
    } : false,
  },
  // Enable experimental features for better performance
  experimental: {
    optimizePackageImports: ['framer-motion', 'lucide-react', 'next-themes'],
    optimizeCss: true,
  },
  // Production optimizations
  reactStrictMode: true,
  poweredByHeader: false,
  // Security & cache headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Static pages: let Cloudflare cache at edge for 1 hour, browsers revalidate
        source: '/((?!api|_next/static|_next/image|resources).*)',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
          { key: 'CDN-Cache-Control', value: 'max-age=3600' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/resources/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;

