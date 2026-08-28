'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  getDiscoActiveSync,
  getSoundsMutedSync,
  getSoundVolumeSync,
} from '@/hooks/useStickers';
import { getProjectVideoState } from '@/lib/siteActionEvents';
import {
  sanitizeClientUiState,
  type ClientUiState,
  type UiPath,
} from '@/lib/siteUiState';
import { isProjectSlug } from '@/lib/projectCatalog';

declare global {
  interface Window {
    __siteUiState?: ClientUiState;
  }
}

function pathnameToUiPath(pathname: string | null): UiPath {
  if (pathname === '/' || pathname === '/about' || pathname === '/projects' || pathname === '/resume' || pathname === '/chat' || pathname === '/guestbook' || pathname === '/stickers' || pathname === '/settings') {
    return pathname;
  }
  return '/';
}

export default function SiteUiStatePublisher(): null {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const publish = () => {
      if (typeof window === 'undefined') return;
      const video = getProjectVideoState();
      const snapshot = sanitizeClientUiState({
        pathname: pathnameToUiPath(pathname),
        theme: resolvedTheme === 'dark' ? 'dark' : 'light',
        disco: getDiscoActiveSync(),
        audio: {
          muted: getSoundsMutedSync(),
          volume: Math.round(getSoundVolumeSync() * 100),
        },
        project: video.available && video.slug && isProjectSlug(video.slug)
          ? { slug: video.slug, playing: video.playing, muted: video.muted }
          : null,
      });
      if (snapshot) window.__siteUiState = snapshot;
    };

    publish();
    window.addEventListener('project-video-state', publish);
    const interval = window.setInterval(publish, 1500);
    return () => {
      window.removeEventListener('project-video-state', publish);
      window.clearInterval(interval);
    };
  }, [pathname, resolvedTheme]);

  return null;
}
