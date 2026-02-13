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
    optimizePackageImports: ['framer-motion', 'lucide-react'],
    optimizeCss: true,
  },
  // Ensure modern bundle output
  transpilePackages: ['lucide-react', 'framer-motion'],
  // Production optimizations
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;

