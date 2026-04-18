import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Patrick_Hand, Fira_Code } from "next/font/google";
import SketchbookLayout from "@/components/SketchbookLayout";
import Navigation from "@/components/Navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TerminalProvider } from "@/context/TerminalContext";
// Analytics deferred via next/script in component
import { Analytics } from "@/components/Analytics";
import DeferredEnhancements from "@/components/DeferredEnhancements";
import EagerEnhancements from "@/components/EagerEnhancements";
import { PERSONAL_LINKS, SITE } from "@/lib/links";
import "./globals.css";

// Both DeferredEnhancements and EagerEnhancements are client components
// ("use client" at the top). Direct import from this server layout is fine —
// Next.js 16 disallows `dynamic(ssr:false)` from server components, but direct
// "use client" imports hydrate normally. Any nested lazy imports happen inside
// each client component.

const patrickHand = Patrick_Hand({
  weight: "400",
  variable: "--font-hand",
  subsets: ["latin"],
  display: "swap", // Prevent FOIT for faster text rendering
});

const firaCode = Fira_Code({
  weight: "400",
  variable: "--font-code",
  subsets: ["latin"],
  display: "optional", // Fira Code is secondary (monospace only) — don't block render
});

const STRUCTURED_DATA_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      "url": SITE.url,
      "name": "Dhruv Mishra Portfolio",
      "description": "Software Engineer at Microsoft specializing in high-performance systems, Android development, and distributed systems.",
      "publisher": { "@id": "https://whoisdhruv.com/#person" }
    },
    {
      "@type": "Person",
      "@id": `${SITE.url}/#person`,
      "name": SITE.name,
      "url": SITE.url,
      "jobTitle": "Software Engineer",
      "worksFor": { "@type": "Organization", "name": "Microsoft" },
      "sameAs": [PERSONAL_LINKS.linkedin, PERSONAL_LINKS.github]
    }
  ]
});

/**
 * Viewport config — explicit so iOS Safari (a) respects `width=device-width`
 * (preventing the auto-zoom that `<pre>` + ASCII-frame content used to
 * trigger on narrow screens) and (b) lets the disco + matrix fixed layers
 * paint into the bottom safe-area via `viewport-fit=cover`. `initialScale:
 * 1` keeps the first paint at 1:1 physical/CSS pixels — no surprise zoom.
 * We intentionally do NOT set `maximumScale: 1` or `userScalable: false`
 * because doing so violates accessibility guidelines (users with low vision
 * need to pinch-zoom). The real fix for the wide-content problem was
 * removing the fixed-width ASCII frame in `lib/sudoCommands.tsx` — content
 * now flows to the viewport width, so the browser has no reason to shrink
 * the layout down.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfbf7' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
  ],
};

export const metadata: Metadata = {
  title: "Dhruv Mishra | Software Engineer",
  description: "Software Engineer at Microsoft specializing in high-performance systems, Android development, and distributed systems. Expert in performance optimization, competitive programming, and building production-ready solutions.",
  keywords: ["Dhruv Mishra", "Software Engineer", "Microsoft", "Android Developer", "Performance Optimization", "Distributed Systems", "Competitive Programming", "Full Stack Developer"],
  authors: [{ name: SITE.name, url: PERSONAL_LINKS.linkedin }],
  creator: "Dhruv Mishra",
  publisher: "Dhruv Mishra",
  metadataBase: new URL(SITE.url),
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE.url,
    title: "Dhruv Mishra | Software Engineer",
    description: "Software Engineer at Microsoft specializing in high-performance systems, Android development, and distributed systems.",
    siteName: "Dhruv Mishra Portfolio",
    images: [
      {
        url: '/resources/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Dhruv Mishra - Software Engineer Portfolio',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Dhruv Mishra | Software Engineer",
    description: "Software Engineer at Microsoft specializing in high-performance systems, Android development, and distributed systems.",
    images: ['/resources/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* JokeAPI: dns-prefetch only (non-critical, used on-demand by terminal) */}
        <link rel="dns-prefetch" href="https://v2.jokeapi.dev" />
        {/*
          Google Analytics: warm the DNS for the gtag.js origin + the beacon
          endpoint. The Analytics component loads GA via next/script with
          `strategy="lazyOnload"`, so the actual request fires well after the
          LCP frame — cheap to prefetch DNS early (one UDP roundtrip, ~20–80 ms
          saved at beacon time on cold connections). Rendered unconditionally:
          even without a `NEXT_PUBLIC_GA_ID`, a dns-prefetch for an unused
          origin is a no-op (the browser just never looks up the name).
        */}
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="manifest" href="/manifest.json" />
        {/* theme-color meta tags are emitted by the `viewport` export above. */}

        {/*
          Audio prefetch — warm the HTTP cache with critical sound samples at
          parse time so the soundManager's first-gesture fetch hits the browser
          cache (instant) instead of the network (50–300 ms). Without this
          hint, the "first button click makes no sound" bug is visible on
          cold-loaded Safari tabs where the fetch of `page-flip.mp3` starts
          AFTER the gesture and the procedural fallback covers the first tap
          only if the AudioContext has had time to unlock.

          Using `rel="preload"` vs `rel="prefetch"` is deliberate: preload
          triggers the warmup immediately at HTML parse; prefetch would defer
          until the next idle tick (too late for a user who clicks quickly
          on mobile).

          React 19 hoists these `<link rel="preload">` tags and dedupes them
          against its own resource-streaming pipeline, so we don't need to
          manually worry about double-downloads. See:
          https://react.dev/reference/react-dom/components/link

          We do NOT preload `disco-loop.mp3` / `disco-start.mp3` / `matrix.mp3`
          — those remain superuser-gated and download only after the user
          earns superuser.
        */}
        <link
          rel="preload"
          as="audio"
          href="/sounds/page-flip.mp3"
          type="audio/mpeg"
        />
        <link
          rel="preload"
          as="audio"
          href="/sounds/theme-dark.mp3"
          type="audio/mpeg"
        />
        <link
          rel="preload"
          as="audio"
          href="/sounds/theme-light.mp3"
          type="audio/mpeg"
        />

        {/* Structured Data (JSON-LD) for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: STRUCTURED_DATA_LD }}
        />
      </head>
      <body
        className={`${patrickHand.variable} ${firaCode.variable} antialiased`}
      >
        <Analytics />
        <ErrorBoundary>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <TerminalProvider>
              <SketchbookLayout>
                <Navigation />
                {children}
              </SketchbookLayout>
              <EagerEnhancements />
              <DeferredEnhancements />
            </TerminalProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
