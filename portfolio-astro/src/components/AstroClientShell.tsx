import type { ReactNode } from 'react';
import { Analytics } from '@/components/Analytics';
import DeferredEnhancements from '@/components/DeferredEnhancements';
import EagerEnhancements from '@/components/EagerEnhancements';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Navigation from '@/components/Navigation';
import SketchbookLayout from '@/components/SketchbookLayout';
import { ThemeProvider } from '@/components/ThemeProvider';

interface AstroClientShellProps {
  children: ReactNode;
}

export default function AstroClientShell({ children }: AstroClientShellProps) {
  return (
    <>
      <Analytics />
      <ErrorBoundary>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SketchbookLayout>
            <Navigation />
            {children}
          </SketchbookLayout>
          <EagerEnhancements />
          <DeferredEnhancements />
        </ThemeProvider>
      </ErrorBoundary>
    </>
  );
}