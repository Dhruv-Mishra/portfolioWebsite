'use client';

/**
 * MatrixNotesEntryButton — site-wide affordance that takes unlocked users
 * directly to `/matrix-notes` without re-escaping.
 *
 * Visibility:
 *   - Hidden for locked users (never rendered — zero bundle cost on their
 *     first paint since the parent gates on `useMatrixEscaped()`).
 *   - Hidden while the matrix overlay is active (the overlay has its own
 *     escape affordance).
 *   - Hidden on `/matrix-notes` itself (no self-link).
 *
 * Position:
 *   Fixed to the bottom-right area (desktop) / bottom-left area (mobile),
 *   tucked near the existing social sidebar so it doesn't fight the
 *   guestbook/sticker glance badge. Tap target 44×44, emerald outlined
 *   pill, subtle pulse to draw the eye without being noisy.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMatrixActive, useMatrixEscaped } from '@/hooks/useStickers';
import { Z_INDEX } from '@/lib/designTokens';

export default function MatrixNotesEntryButton(): React.ReactElement | null {
  const pathname = usePathname();
  const escaped = useMatrixEscaped();
  const matrixActive = useMatrixActive();

  if (!escaped) return null;
  if (matrixActive) return null;
  if (pathname === '/matrix-notes') return null;

  return (
    <Link
      href="/matrix-notes"
      aria-label="Open matrix notes — the secret post-escape wall"
      title="Matrix notes"
      className="fixed bottom-4 right-4 md:right-6 md:bottom-6 inline-flex items-center gap-2 min-h-[44px] min-w-[44px] px-3 md:px-4 rounded-full border border-emerald-400/60 bg-black/60 backdrop-blur-[2px] font-code text-[11px] md:text-xs tracking-[0.2em] uppercase text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.35)] transition-[box-shadow,transform,background-color] duration-200 hover:bg-black/75 hover:shadow-[0_0_26px_rgba(16,185,129,0.55)] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 pointer-events-auto"
      style={{ zIndex: Z_INDEX.sidebar }}
      prefetch={false}
      data-clickable
    >
      <MatrixGlyph size={16} />
      <span className="hidden md:inline">matrix notes</span>
      <span className="md:hidden">notes</span>
    </Link>
  );
}

function MatrixGlyph({ size }: { size: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="12" height="12" rx="2" opacity="0.85" />
      <text
        x="8"
        y="11"
        textAnchor="middle"
        fontFamily="'Fira Code', monospace"
        fontSize="7"
        fontWeight="bold"
        stroke="none"
        fill="currentColor"
      >
        &gt;_
      </text>
    </svg>
  );
}
