import { execSync } from "node:child_process";

import type { NextConfig } from "next";

function resolveBuildId(): string {
  const explicitBuildId =
    process.env.NEXT_BUILD_ID ??
    process.env.GITHUB_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.CF_PAGES_COMMIT_SHA;

  if (explicitBuildId) {
    return explicitBuildId.trim();
  }

  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "local-build";
  }
}

const BUILD_ID = resolveBuildId();

const nextConfig: NextConfig = {
  // Standalone output for minimal server footprint (~50MB vs ~150MB) — critical for 1GB RAM VMs
  output: 'standalone',
  // Multi-origin deployments behind Cloudflare must emit the same build ID on every VM.
  // Otherwise HTML from one origin can reference runtime artifacts that do not exist on another.
  generateBuildId: async () => BUILD_ID,
  // Disable Next.js compression — nginx/Cloudflare handles gzip/brotli upstream,
  // avoiding double-compression CPU overhead on resource-constrained VMs.
  compress: false,
  images: {
    // Enable Next.js image optimization (sharp) for responsive srcset, AVIF, lazy placeholders
    // Removed `unoptimized: true` — build-time optimization is viable even on 1-vCPU
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 828, 1024, 1200],
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
    optimizePackageImports: ['framer-motion', 'lucide-react', 'next-themes', 'clsx', 'tailwind-merge'],
    optimizeCss: true,
  },
  // Allow LAN devices (e.g. mobile on same WiFi) to access dev server
  allowedDevOrigins: ['http://192.168.1.38:3000'],
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

