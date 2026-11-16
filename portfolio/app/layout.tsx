import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import localFont from "next/font/local";
import SketchbookLayout from "@/components/SketchbookLayout";
import { SketchbookDecor } from "@/components/SketchbookDoodles";
import Navigation from "@/components/Navigation";
import RouteScrollSurface from "@/components/RouteScrollSurface";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Analytics } from "@/components/Analytics";
import DeferredEnhancements from "@/components/DeferredEnhancements";
import EagerEnhancements from "@/components/EagerEnhancements";
import { PERSONAL_LINKS, SITE } from "@/lib/links";
import { LOOK_BOOT_SNIPPET } from "@/lib/lookPrefs";
import { OG_IMAGE, SITE_DESCRIPTION } from "@/lib/pageMetadata";
import "./globals.css";
import "./look.css";

// Self-hosted latin subsets, served from the same origin.
const patrickHand = localFont({
  src: "./fonts/patrick-hand-latin-400.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-patrick-hand",
  display: "swap", // Prevent FOIT for faster text rendering
});

const firaCode = localFont({
  src: "./fonts/fira-code-latin-400.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-fira-code",
  preload: false,
  display: "swap",
  // The default Arial-metric fallback is proportional; fall through to the monospace stack in @theme instead.
  adjustFontFallback: false,
});

// Optional clean reading face (Settings > Reading font); only downloaded once a page renders text in it.
const atkinson = localFont({
  src: "./fonts/atkinson-hyperlegible-next-latin-400.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-atkinson",
  preload: false,
  display: "swap",
});

const STRUCTURED_DATA_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      "url": SITE.url,
      "name": "Dhruv Mishra Portfolio",
      "description": SITE_DESCRIPTION,
      "publisher": { "@id": "https://whoisdhruv.com/#person" }
    },
    {
      "@type": "Person",
      "@id": `${SITE.url}/#person`,
      "name": SITE.name,
      "url": SITE.url,
      "jobTitle": "Software Engineer",
      "worksFor": { "@type": "Organization", "name": "Microsoft", "url": "https://www.microsoft.com" },
      "description": "Software engineer at Microsoft who builds production AI agents and the Azure backend services they run on.",
      "image": `${SITE.url}/resources/aboutPhoto.webp`,
      "email": PERSONAL_LINKS.email.replace(/^mailto:/, ''),
      "address": { "@type": "PostalAddress", "addressLocality": "Noida", "addressCountry": "IN" },
      "alumniOf": {
        "@type": "CollegeOrUniversity",
        "name": "Indraprastha Institute of Information Technology Delhi (IIIT-Delhi)",
        "url": "https://www.iiitd.ac.in"
      },
      "knowsAbout": ["AI agents", "LLM agents", "Model Context Protocol (MCP)", "Retrieval-augmented generation", "Voice AI", "Azure", "Distributed systems", "Backend engineering", "Performance optimization", "C#", "TypeScript", "Python", "C++"],
      "sameAs": [PERSONAL_LINKS.linkedin, PERSONAL_LINKS.github, PERSONAL_LINKS.codeforces]
    }
  ]
});

const SITE_PREFS_BOOTSTRAP = `(()=>{try{const r=localStorage.getItem('dhruv-admin-prefs');const p=r?JSON.parse(r):{};const o=p&&typeof p==='object'&&!Array.isArray(p)?p:{};const e=document.documentElement;${LOOK_BOOT_SNIPPET};const s=o.paperStock;(s==='blueprint'||s==='kraft'||s==='sage')?e.dataset.paperStock=s:delete e.dataset.paperStock;const b=(k,d)=>typeof o[k]==='boolean'?o[k]:d;b('paperGrain',true)?e.dataset.prefPaper='on':delete e.dataset.prefPaper;b('tapeEffects',true)?e.dataset.prefTape='on':delete e.dataset.prefTape;b('sketchOutlines',true)?e.dataset.prefSketch='on':delete e.dataset.prefSketch;o.readingFont==='clean'?e.dataset.readingFont='clean':delete e.dataset.readingFont;o.motionPreference==='system'?delete e.dataset.motion:o.motionPreference==='reduced'||o.motionPreference==='full'?e.dataset.motion=o.motionPreference:e.dataset.motion='full';const m=e.dataset.motion;m==='reduced'||(m!=='full'&&matchMedia('(prefers-reduced-motion: reduce)').matches)?e.dataset.reducedMotion='':delete e.dataset.reducedMotion;}catch{const e=document.documentElement,o={};${LOOK_BOOT_SNIPPET};delete e.dataset.paperStock;e.dataset.prefPaper='on';e.dataset.prefTape='on';e.dataset.prefSketch='on';e.dataset.motion='full';}})();`;

// Rendered on the server so the decorative SVGs stay out of the client bundle.
const SKETCHBOOK_DOODLES = <SketchbookDecor />;

// viewport-fit=cover lets fixed disco layers reach the safe area; zoom stays enabled for accessibility.
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
  title: "Dhruv Mishra | Software Engineer, AI Agents",
  description: SITE_DESCRIPTION,
  keywords: ["Dhruv Mishra", "Software Engineer", "Microsoft", "AI Agents", "LLM Agents", "MCP", "Model Context Protocol", "Voice AI", "RAG", "Azure", "Backend Engineer", "Distributed Systems", "C#", "TypeScript", "Python", "Competitive Programming"],
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
    title: "Dhruv Mishra | Software Engineer, AI Agents",
    description: SITE_DESCRIPTION,
    siteName: "Dhruv Mishra Portfolio",
    // 1200x630 sketchbook card generated from /resources/aboutPhoto.webp.
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Dhruv Mishra | Software Engineer, AI Agents",
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE.url],
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
    <html lang="en" className={`${patrickHand.variable} ${firaCode.variable} ${atkinson.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SITE_PREFS_BOOTSTRAP }} />
        {/* JokeAPI: dns-prefetch only (non-critical, used on-demand by terminal) */}
        <link rel="dns-prefetch" href="https://v2.jokeapi.dev" />
        <link rel="manifest" href="/manifest.json" />
        {/* theme-color meta tags are emitted by the `viewport` export above. */}

        {/* Structured Data (JSON-LD) for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: STRUCTURED_DATA_LD }}
        />
      </head>
      <body className="antialiased">
        <Analytics />
        <ErrorBoundary>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <SketchbookLayout doodles={SKETCHBOOK_DOODLES}>
              <Navigation />
              <RouteScrollSurface>{children}</RouteScrollSurface>
            </SketchbookLayout>
            <EagerEnhancements />
            <DeferredEnhancements />
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
