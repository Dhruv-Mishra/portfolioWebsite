"use client";

/**
 * DiscoMuteButton — small floating mute control, visible only while disco
 * mode is on. Sits in the bottom-right, just above the Feedback FAB so it
 * does not shove any existing chrome.
 *
 * Behavior:
 *   - Toggles the persisted `discoMuted` flag in the sticker store.
 *   - The actual audio engine subscribes via DiscoModeController and calls
 *     setMuted() in response; this button is UI-only.
 *   - `aria-pressed` reflects the muted state so screen readers know the
 *     current toggle position.
 */

import { memo, useCallback } from 'react';
import { useDiscoMuted, setDiscoMutedImperative } from '@/hooks/useStickers';
import { Z_INDEX } from '@/lib/designTokens';

function DiscoMuteButton(): React.ReactElement {
  const muted = useDiscoMuted();

  const onToggle = useCallback(() => {
    setDiscoMutedImperative(!muted);
  }, [muted]);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute disco music' : 'Mute disco music'}
      className="disco-mute-btn"
      data-disco-mute
      style={{ zIndex: Z_INDEX.nav }}
    >
      {muted ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
      <span className="disco-mute-btn__label">{muted ? 'Muted' : 'Disco'}</span>
    </button>
  );
}

export default memo(DiscoMuteButton);
