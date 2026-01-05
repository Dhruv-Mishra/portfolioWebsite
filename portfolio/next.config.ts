import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true, // Required for static export
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
  },
  // Production optimizations
  reactStrictMode: true,
  poweredByHeader: false,
  
  // Target modern browsers only - eliminates legacy polyfills
  // This reduces bundle size significantly by not transpiling 
  // modern JS features like Array.prototype.at, Object.hasOwn, etc.
  transpilePackages: [],
};

export default nextConfig;

