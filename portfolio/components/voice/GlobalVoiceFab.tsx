'use client';

import { memo, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { AudioLines } from 'lucide-react';
import { requestVoiceMode } from '@/lib/voiceModeStore';
import { topicFromPath } from '@/lib/voiceClientSnapshot';
import { cn } from '@/lib/utils';
import { INTERACTION_TOKENS, ANIMATION_TOKENS, Z_INDEX } from '@/lib/designTokens';
import { m } from 'framer-motion';

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;
const getVoiceModeSnapshot = () => Boolean(document.documentElement.dataset.voiceMode);
const getServerVoiceModeSnapshot = () => false;
const subscribeToVoiceMode = (onStoreChange: () => void) => {
  window.addEventListener('voice-mode:change', onStoreChange);
  return () => window.removeEventListener('voice-mode:change', onStoreChange);
};

const FAB_POSITION_STYLE = {
  right: 'max(1rem, env(safe-area-inset-right, 0px))',
  bottom: 'var(--c-mobile-floating-voice-bottom)',
  transform: 'rotate(2deg)',
} as const;

interface GlobalVoiceFabProps {
  variant?: 'desktop' | 'mobile';
}

function GlobalVoiceFabImpl({ variant = 'desktop' }: GlobalVoiceFabProps): React.ReactElement | null {
  const pathname = usePathname();
  const hasMounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const voiceModeActive = useSyncExternalStore(
    subscribeToVoiceMode,
    getVoiceModeSnapshot,
    getServerVoiceModeSnapshot,
  );

  if (!hasMounted) {
    return variant === 'desktop' ? <div className="h-11 w-11" /> : null;
  }
  if (voiceModeActive) return null;

  const topic = topicFromPath(pathname);
  const startVoice = () => requestVoiceMode({ source: 'nav', topic });

  if (variant === 'desktop') {
    return (
      <button
        type="button"
        onClick={startVoice}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-200/20 dark:hover:bg-gray-700/20 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-ink)]/50"
        aria-label="Talk with Dhruv by voice"
        title="Talk to me"
      >
        <AudioLines className="h-5 w-5 text-indigo-600/80 dark:text-indigo-200/80" strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <m.button
      type="button"
      onClick={startVoice}
      aria-label="Talk with Dhruv by voice"
      title="Talk to me"
      whileHover={INTERACTION_TOKENS.hover.scaleUp}
      whileTap={INTERACTION_TOKENS.tap.press}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: 1,
        scale: 1,
        transition: { type: 'spring' as const, ...ANIMATION_TOKENS.spring.bouncy },
      }}
      className={cn(
        'fixed h-[max(var(--c-fab-size),44px)] w-[max(var(--c-fab-size),44px)] rounded-full',
        'flex items-center justify-center shadow-lg',
        'bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/60',
        'text-indigo-600 dark:text-indigo-300',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
      )}
      style={{ ...FAB_POSITION_STYLE, zIndex: Z_INDEX.nav }}
    >
      <AudioLines size={22} strokeWidth={2.2} />
    </m.button>
  );
}

export default memo(GlobalVoiceFabImpl);
