"use client";
import { Suspense, useCallback, useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppHaptics } from '@/lib/haptics';
import { isProjectSlug, type ProjectSlug } from '@/lib/projectSlugs';
import { unlockSticker } from '@/hooks/useStickers';
import { appendUserAction } from '@/lib/userActionJournal';
import {
  CLOSE_PROJECT_EVENT,
  OPEN_PROJECT_EVENT,
  attachSiteActionResult,
  readProjectSlugFromSearch,
  type OpenProjectEventDetail,
} from '@/lib/siteActionEvents';

// Project details stay out of the initial client bundle until a modal opens.
const ChatProjectModal = dynamic(() => import('@/components/ChatProjectModal'), { ssr: false });

// Isolated behind its own Suspense so useSearchParams cannot bail the server-rendered grid out to CSR.
function ProjectQuerySync({ onQuerySlug }: { onQuerySlug: (slug: string | null) => void }) {
  const querySlug = readProjectSlugFromSearch(useSearchParams().toString());
  const reportQuerySlug = useEffectEvent((slug: string | null) => onQuerySlug(slug));

  useEffect(() => {
    reportQuerySlug(querySlug);
  }, [querySlug]);

  return null;
}

export default function ProjectGridController({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { closePanel, openPanel } = useAppHaptics();
  const [selectedSlug, setSelectedSlug] = useState<ProjectSlug | null>(null);
  const [hasOpenedProject, setHasOpenedProject] = useState(false);

  const openProjectBySlug = useCallback((slug: string) => {
    if (!isProjectSlug(slug)) return false;
    openPanel();
    setHasOpenedProject(true);
    setSelectedSlug(slug);
    unlockSticker('project-explorer');
    appendUserAction({ kind: 'project.open', slug });
    return true;
  }, [openPanel]);

  const handleQuerySlug = useCallback((slug: string | null) => {
    if (slug) openProjectBySlug(slug);
    else setSelectedSlug(null);
  }, [openProjectBySlug]);

  const handleCloseModal = useCallback(() => {
    closePanel();
    setSelectedSlug(null);
    router.replace('/projects', { scroll: false });
  }, [closePanel, router]);

  useEffect(() => {
    const handler = (raw: Event) => {
      const event = raw as CustomEvent<OpenProjectEventDetail>;
      const slug = event.detail?.slug;
      if (!slug || !openProjectBySlug(slug)) return;
      attachSiteActionResult(event, {
        ok: true,
        spokenText: 'Queued that project to open.',
        data: { slug, accepted: true, nextAction: 'I can play, pause, mute, or unmute the preview if it has a video.' },
      });
    };
    window.addEventListener(OPEN_PROJECT_EVENT, handler);
    return () => window.removeEventListener(OPEN_PROJECT_EVENT, handler);
  }, [openProjectBySlug]);

  useEffect(() => {
    const handler = (raw: Event) => {
      handleCloseModal();
      attachSiteActionResult(raw, {
        ok: true,
        spokenText: 'Closing that project.',
      });
    };
    window.addEventListener(CLOSE_PROJECT_EVENT, handler);
    return () => window.removeEventListener(CLOSE_PROJECT_EVENT, handler);
  }, [handleCloseModal]);

  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ProjectQuerySync onQuerySlug={handleQuerySlug} />
      </Suspense>
      {hasOpenedProject ? (
        <ChatProjectModal
          projectSlug={selectedSlug}
          onClose={handleCloseModal}
        />
      ) : null}
    </>
  );
}
