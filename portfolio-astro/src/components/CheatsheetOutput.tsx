"use client";

/**
 * CheatsheetOutput — rendered as the output of the `sudo cheatsheet` terminal
 * command. Reads the live sticker store so the ✓ / – state reflects reality
 * for the current visitor. No framer; pure static JSX + narrow subscription.
 */
import { useMemo } from 'react';
import { STICKER_ROSTER, type StickerId } from '@/lib/stickers';
import { useStickerUnlocked, useStickerProgress } from '@/hooks/useStickers';

const DIVIDER = '─'.repeat(56);

export default function CheatsheetOutput(): React.ReactElement {
  const unlocked = useStickerUnlocked();
  const { unlocked: count, total } = useStickerProgress();

  // Set lookup makes per-row membership check O(1) instead of O(n).
  const unlockedSet = useMemo(
    () => new Set<StickerId>(unlocked),
    [unlocked],
  );

  return (
    <div className="font-mono text-xs md:text-sm leading-relaxed">
      <div className="flex items-baseline gap-3 text-emerald-300 font-bold">
        <span>✦ sticker cheatsheet</span>
        <span className="text-gray-500 font-normal">[{count}/{total} pinned]</span>
      </div>
      <div className="text-gray-600 my-1 select-none">{DIVIDER}</div>

      <ul className="space-y-0.5">
        {STICKER_ROSTER.map((sticker) => {
          const isUnlocked = unlockedSet.has(sticker.id);
          return (
            <li
              key={sticker.id}
              className="grid grid-cols-[1.25rem_minmax(9rem,auto)_1fr] gap-x-3 items-baseline"
            >
              <span
                aria-hidden="true"
                className={isUnlocked ? 'text-emerald-400' : 'text-gray-600'}
              >
                {isUnlocked ? '✓' : '─'}
              </span>
              <span
                className={
                  isUnlocked
                    ? 'text-emerald-300 font-bold truncate'
                    : 'text-gray-500 truncate'
                }
              >
                {sticker.id}
              </span>
              <span
                className={
                  isUnlocked
                    ? 'text-gray-200/90'
                    : 'text-gray-500 italic'
                }
              >
                {isUnlocked ? sticker.description : sticker.hint}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="text-gray-600 mt-1 select-none">{DIVIDER}</div>
      <div className="text-gray-500 mt-1">
        open{' '}
        <a
          href="/stickers"
          className="text-emerald-400 underline font-bold decoration-dotted hover:decoration-solid"
        >
          /stickers
        </a>{' '}
        for the full album
      </div>
    </div>
  );
}
