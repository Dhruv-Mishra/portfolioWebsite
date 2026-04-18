import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

// Absolute path to this config file's directory. This pins the Next.js workspace
// root so a stray parent lockfile can never flip auto-detection and emit the
// standalone build to the wrong tree. See:
// https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory
const CONFIG_DIR: string = (() => {
  if (typeof __dirname === "string") return __dirname;
  // `__dirname` is always provided by Next's config loader in practice. This
  // fallback only runs in edge runtimes we don't use; assert loudly rather
  // than silently resolving to the wrong cwd (which would defeat the whole
  // purpose of pinning `turbopack.root`).
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "next.config.ts"))) return cwd;
  const candidate = path.join(cwd, "portfolio");
  if (fs.existsSync(path.join(candidate, "next.config.ts"))) return candidate;
  throw new Error(
    "[next.config.ts] Cannot resolve CONFIG_DIR: __dirname is unavailable and neither cwd nor cwd/portfolio contains next.config.ts. Run the build from the portfolio/ directory.",
  );
})();

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
  // File-trace the standalone bundle against this file's dir. Without this,
  // Next.js autodetects from the nearest lockfile which can miss monorepo roots.
  outputFileTracingRoot: CONFIG_DIR,
  // Strip native-binary deps from the runtime bundle. Even with
  // `images.unoptimized: true`, Next.js's file tracer walks require() graphs
  // statically and pulls sharp + @img/sharp-<platform> into .next/standalone/
  // regardless of whether they're actually invoked. Excluding them here makes
  // the resulting bundle truly arch-agnostic (pure JS) and ~30MB smaller.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/sharp/**',
      'node_modules/@img/**',
      'node_modules/@next/swc-*/**',
    ],
  },
  // Pin workspace root so Next.js never auto-detects from a stray parent lockfile.
  // Without this, a lockfile one dir up can flip the resolved root and emit
  // standalone output in the wrong tree — breaking VPS deploys.
  turbopack: {
    root: CONFIG_DIR,
  },
  // Multi-origin deployments behind Cloudflare must emit the same build ID on every VM.
  // Otherwise HTML from one origin can reference runtime artifacts that do not exist on another.
  generateBuildId: async () => BUILD_ID,
  // Disable Next.js compression — nginx/Cloudflare handles gzip/brotli upstream,
  // avoiding double-compression CPU overhead on resource-constrained VMs.
  compress: false,
  images: {
    // Image optimization disabled — the portfolio has ~8 images, all pre-optimized .webp,
    // sitting behind Cloudflare which handles edge compression and caching.
    // Disabling removes sharp (the only native-binary runtime dep), letting a single
    // arch-agnostic JS build deploy to any Linux VM (x86_64 / arm64 / whatever).
    // <Image> components still give us lazy loading, blur placeholders (via blurDataURL),
    // priority hints, and layout-shift prevention — we only lose runtime AVIF conversion
    // and responsive-srcset resizing, both of which are handled upstream by Cloudflare.
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
    // `optimizePackageImports` rewrites `import { X } from 'pkg'` into a deep
    // path import so unused exports never land in the bundle. We include every
    // client-side dependency that exposes a barrel entry AND is imported by
    // more than one route — this includes `web-haptics` and `web-haptics/react`
    // (used on every page via `useAppHaptics`), alongside the already-covered
    // animation/icon libs. `next/dynamic` is a framework-level hot path and
    // benefits too.
    optimizePackageImports: [
      'framer-motion',
      'lucide-react',
      'next-themes',
      'clsx',
      'tailwind-merge',
      'web-haptics',
      'web-haptics/react',
    ],
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
          {
            key: 'Cache-Control',
            // In dev, edits regenerate chunks but URLs can collide as
            // Turbopack rewrites bundles incrementally — `immutable` then
            // pins stale bytes in the browser. Only production builds
            // emit fully content-addressed, durable hashes worth pinning.
            value:
              process.env.NODE_ENV === 'production'
                ? 'public, max-age=31536000, immutable'
                : 'no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/resources/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Audio samples — immutable caching + explicit byte-range advertisement.
        // In production nginx owns this (see nginx-cloudflare.conf `/sounds/`
        // block) and this Next.js header is redundant. In dev / non-nginx
        // deploys (Vercel, local `npm start`) this ensures the browser caches
        // the MP3s aggressively AND iOS Safari's <audio> playback path sees
        // `Accept-Ranges: bytes` so 206 range requests work.
        source: '/sounds/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Accept-Ranges', value: 'bytes' },
        ],
      },
    ];
  },
};

export default nextConfig;

