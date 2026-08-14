'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Z_INDEX } from '@/lib/designTokens';

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

interface ResumeOpenPdfButtonProps {
  href: string;
}

export default function ResumeOpenPdfButton({ href }: ResumeOpenPdfButtonProps) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  const button = (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed right-[max(0.75rem,env(safe-area-inset-right,0px))] top-[max(7.5rem,calc(env(safe-area-inset-top,0px)+6.75rem))] flex min-h-11 items-center md:hidden"
      style={{ zIndex: Z_INDEX.modal }}
      title="Open PDF in new tab"
    >
      <span className="flex min-h-11 items-center gap-1.5 rounded-lg border border-yellow-200/50 bg-yellow-100 px-3 py-1.5 font-hand text-sm font-bold text-gray-800 shadow-lg -rotate-2">
        <span>Open PDF</span>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </span>
    </a>
  );

  if (!mounted) return null;
  return createPortal(button, document.body);
}
