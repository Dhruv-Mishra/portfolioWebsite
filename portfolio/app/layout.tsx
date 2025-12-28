import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Patrick_Hand, Fira_Code } from "next/font/google";
import SketchbookLayout from "@/components/SketchbookLayout";
import Navigation from "@/components/Navigation";
import SketchbookCursor from "@/components/SketchbookCursor";
import { TerminalProvider } from "@/context/TerminalContext";
import "./globals.css";

const patrickHand = Patrick_Hand({
  weight: "400",
  variable: "--font-hand",
  subsets: ["latin"],
});

const firaCode = Fira_Code({
  variable: "--font-code",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dhruv's Portfolio | Sketchbook Terminal",
  description: "A developer portfolio sketchbook.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${patrickHand.variable} ${firaCode.variable} antialiased`}
      >

        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <TerminalProvider>
            <SketchbookCursor />
            <SketchbookLayout>
              <Navigation />
              {children}
            </SketchbookLayout>
          </TerminalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
