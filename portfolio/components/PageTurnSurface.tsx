"use client";

import { usePathname } from 'next/navigation';

export default function PageTurnSurface({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className="h-full min-h-full min-w-0 isolate animate-page-template-in"
    >
      <div className="relative z-0 h-full min-h-full min-w-0">
        {children}
      </div>
    </div>
  );
}