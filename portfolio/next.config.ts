import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: output: "export" removed to enable API routes (needed for /api/chat).
  // Deploy with `next start` behind nginx instead of serving static files.
  images: {
    unoptimized: true,
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
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;

