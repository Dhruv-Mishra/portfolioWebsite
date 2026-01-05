import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Patrick_Hand, Fira_Code } from "next/font/google";
import SketchbookLayout from "@/components/SketchbookLayout";
import Navigation from "@/components/Navigation";
import SketchbookCursor from "@/components/SketchbookCursor";
import { TerminalProvider } from "@/context/TerminalContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Analytics } from "@/components/Analytics";
import "./globals.css";

const patrickHand = Patrick_Hand({
  weight: "400",
  variable: "--font-hand",
  subsets: ["latin"],
  display: "swap", // Prevent FOIT for faster text rendering
});

const firaCode = Fira_Code({
  variable: "--font-code",
  subsets: ["latin"],
  display: "swap", // Prevent FOIT for faster text rendering
});

export const metadata: Metadata = {
  title: "Dhruv Mishra | Software Engineer",
  description: "Software Engineer at Microsoft specializing in high-performance systems, Android development, and distributed systems. Expert in performance optimization, competitive programming, and building production-ready solutions.",
  keywords: ["Dhruv Mishra", "Software Engineer", "Microsoft", "Android Developer", "Performance Optimization", "Distributed Systems", "Competitive Programming", "Full Stack Developer"],
  authors: [{ name: "Dhruv Mishra", url: "https://www.linkedin.com/in/dhruv-mishra-id/" }],
  creator: "Dhruv Mishra",
  publisher: "Dhruv Mishra",
  metadataBase: new URL('https://whoisdhruv.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://whoisdhruv.com',
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
  verification: {
    // Add these when you have them
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
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
        {/* Preconnect to critical third-party origins */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="preconnect" href="https://v2.jokeapi.dev" />
        <link rel="dns-prefetch" href="https://v2.jokeapi.dev" />

        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#fdfbf7" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#1a1a1a" media="(prefers-color-scheme: dark)" />

        {/* Structured Data (JSON-LD) for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": "https://whoisdhruv.com/#website",
                  "url": "https://whoisdhruv.com",
                  "name": "Dhruv Mishra Portfolio",
                  "description": "Software Engineer at Microsoft specializing in high-performance systems, Android development, and distributed systems.",
                  "publisher": { "@id": "https://whoisdhruv.com/#person" }
                },
                {
                  "@type": "Person",
                  "@id": "https://whoisdhruv.com/#person",
                  "name": "Dhruv Mishra",
                  "url": "https://whoisdhruv.com",
                  "jobTitle": "Software Engineer",
                  "worksFor": {
                    "@type": "Organization",
                    "name": "Microsoft"
                  },
                  "sameAs": [
                    "https://www.linkedin.com/in/dhruv-mishra-id/",
                    "https://github.com/its-DhruvMishra"
                  ]
                }
              ]
            })
          }}
        />
      </head>
      <body
        className={`${patrickHand.variable} ${firaCode.variable} antialiased`}
      >
        <Analytics />
        <ErrorBoundary>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <TerminalProvider>
              <SketchbookCursor />
              <SketchbookLayout>
                <Navigation />
                {children}
              </SketchbookLayout>
            </TerminalProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
