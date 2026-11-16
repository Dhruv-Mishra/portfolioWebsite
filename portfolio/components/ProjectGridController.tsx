"use client";
import { Suspense, useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useAppHaptics } from '@/lib/haptics';
import { release, reset, shownFastener } from '@/lib/fasteners';
import { isProjectSlug, type ProjectSlug } from '@/lib/projectSlugs';
import { useEffectiveReducedMotion } from '@/hooks/useEffectiveReducedMotion';
import { useSitePrefs } from '@/hooks/useSitePrefs';
import { unlockSticker } from '@/hooks/useStickers';
import { appendUserAction } from '@/lib/userActionJournal';
import {
  CLOSE_PROJECT_EVENT,
  OPEN_PROJECT_EVENT,
  attachSiteActionResult,
  buildProjectHref,
  readProjectSlugFromSearch,
  type OpenProjectEventDetail,
} from '@/lib/siteActionEvents';

// Project details stay out of the initial client bundle; hovering or focusing a note warms the chunk.
const loadModal = () => import('@/components/ChatProjectModal');
const ChatProjectModal = dynamic(loadModal, { ssr: false });

const NOTE_SELECTOR = 'a[data-project-slug]';

function focusNote(slug: ProjectSlug) {
  document.querySelector<HTMLElement>(`${NOTE_SELECTOR}[data-project-slug="${slug}"]`)?.focus({ preventScroll: true });
}

/**
 * `?project=` is the single source of truth for the open note. Notes are plain links (deep-linkable, new-tab
 * friendly); a plain click pushes the query through the History API, which Next syncs into useSearchParams
 * without a server round trip.
 */
function ProjectRoute() {
  const raw = readProjectSlugFromSearch(useSearchParams().toString());
  const slug = raw && isProjectSlug(raw) ? raw : null;
  const { closePanel, openPanel } = useAppHaptics();
  const { noteFlight } = useSitePrefs();
  const reducedMotion = useEffectiveReducedMotion();
  const [hasOpened, setHasOpened] = useState(false);
  // Set while the open note sits on a history entry this page pushed, so closing pops it instead of stacking.
  const pushedRef = useRef(false);
  const peelingRef = useRef(false);
  const opensRef = useRef(0);
  const mountedRef = useRef(false);

  if (slug && !hasOpened) setHasOpened(true);

  const close = useCallback(() => {
    closePanel();
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, '', '/projects');
    }
  }, [closePanel]);

  const show = useEffectEvent((next: ProjectSlug, fromClick: boolean) => {
    opensRef.current += 1;
    // Gives the dialog an opener to return focus to: Safari does not focus clicked links, and voice opens have none.
    if (fromClick || (!slug && document.activeElement === document.body)) focusNote(next);
    if (slug) {
      window.history.replaceState(null, '', buildProjectHref(next));
    } else {
      window.history.pushState(null, '', buildProjectHref(next));
      pushedRef.current = true;
    }
  });

  const onOpened = useEffectEvent((opened: ProjectSlug) => {
    openPanel();
    unlockSticker('project-explorer');
    appendUserAction({ kind: 'project.open', slug: opened });
  });

  // Layout effects run before the dialog's own effects, so it records the note (not <body>) as the place to return focus.
  useLayoutEffect(() => {
    if (slug && document.activeElement === document.body) focusNote(slug);
  }, [slug]);

  useEffect(() => {
    if (slug) onOpened(slug);
    else pushedRef.current = false;
  }, [slug]);

  const onClick = useEffectEvent((event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest<HTMLElement>(NOTE_SELECTOR);
    const next = link?.dataset.projectSlug;
    if (!next || !isProjectSlug(next)) return;
    event.preventDefault();
    // The tape peels off first, then the card flies; ProjectModal rolls it back on after the card lands.
    const tape = noteFlight === 'pin' && !reducedMotion ? shownFastener(link?.closest('[data-project-card]')) : null;
    if (!tape) {
      show(next, true);
      return;
    }
    if (peelingRef.current) return;
    peelingRef.current = true;
    const opensBefore = opensRef.current;
    void release(tape).then(() => {
      peelingRef.current = false;
      // Left the page, or voice opened another project mid-peel: put the tape back instead of opening this one.
      if (!mountedRef.current || opensRef.current !== opensBefore) {
        reset(tape);
        return;
      }
      show(next, true);
    });
  });

  const onVoiceOpen = useEffectEvent((event: Event) => {
    const next = (event as CustomEvent<OpenProjectEventDetail>).detail?.slug;
    if (!next || !isProjectSlug(next)) return;
    show(next, false);
    attachSiteActionResult(event, {
      ok: true,
      spokenText: 'Queued that project to open.',
      data: { slug: next, accepted: true, nextAction: 'I can play, pause, mute, or unmute the preview if it has a video.' },
    });
  });

  const onVoiceClose = useEffectEvent((event: Event) => {
    // Left unclaimed when nothing is open, so the voice agent says so instead of pretending to close.
    if (!slug) return;
    close();
    attachSiteActionResult(event, { ok: true, spokenText: 'Closing that project.' });
  });

  useEffect(() => {
    const warm = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest(NOTE_SELECTOR)) return;
      void loadModal();
      document.removeEventListener('pointerover', warm);
      document.removeEventListener('focusin', warm);
    };
    const handleClick = (event: MouseEvent) => onClick(event);
    const handleOpen = (event: Event) => onVoiceOpen(event);
    const handleClose = (event: Event) => onVoiceClose(event);
    document.addEventListener('pointerover', warm, { passive: true });
    document.addEventListener('focusin', warm);
    document.addEventListener('click', handleClick);
    window.addEventListener(OPEN_PROJECT_EVENT, handleOpen);
    window.addEventListener(CLOSE_PROJECT_EVENT, handleClose);
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      document.removeEventListener('pointerover', warm);
      document.removeEventListener('focusin', warm);
      document.removeEventListener('click', handleClick);
      window.removeEventListener(OPEN_PROJECT_EVENT, handleOpen);
      window.removeEventListener(CLOSE_PROJECT_EVENT, handleClose);
    };
  }, []);

  return hasOpened ? <ChatProjectModal projectSlug={slug} onClose={close} /> : null;
}

export default function ProjectGridController() {
  // useSearchParams gets its own boundary so the server-rendered wall never bails out to client rendering.
  return (
    <Suspense fallback={null}>
      <ProjectRoute />
    </Suspense>
  );
}
