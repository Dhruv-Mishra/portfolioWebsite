"use client";
import { Suspense, useCallback, useEffect, useEffectEvent, useState, type MouseEvent, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppHaptics } from '@/lib/haptics';
import { PROJECTS_BY_SLUG } from '@/lib/projects';
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

const ProjectModal = dynamic(() => import('@/components/ProjectModal'), { ssr: false });

// Isolated behind its own Suspense so useSearchParams cannot bail the server-rendered grid out to CSR.
function ProjectQuerySync({ onQuerySlug }: { onQuerySlug: (slug: string | null) => void }) {
  const querySlug = readProjectSlugFromSearch(useSearchParams().toString());
  const reportQuerySlug = useEffectEvent((slug: string | null) => onQuerySlug(slug));

  useEffect(() => {
    reportQuerySlug(querySlug);
  }, [querySlug]);

  return null;
}

export default function ProjectGridController({ className, children }: { className: string; children: ReactNode }) {
  const router = useRouter();
  const { closePanel, openPanel } = useAppHaptics();
  const [selectedSlug, setSelectedSlug] = useState<ProjectSlug | null>(null);
  const [hasOpenedProject, setHasOpenedProject] = useState(false);
  const [querySlug, setQuerySlug] = useState<string | null>(null);

  const openProjectBySlug = useCallback((slug: string) => {
    if (!isProjectSlug(slug) || !PROJECTS_BY_SLUG[slug]) return false;
    openPanel();
    setHasOpenedProject(true);
    setSelectedSlug(slug);
    unlockSticker('project-explorer');
    appendUserAction({ kind: 'project.open', slug });
    return true;
  }, [openPanel]);

  const handleQuerySlug = useCallback((slug: string | null) => {
    setQuerySlug(slug);
    if (slug) openProjectBySlug(slug);
  }, [openProjectBySlug]);

  const handleGridClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const slug = event.target.closest<HTMLElement>('[data-project-slug]')?.dataset.projectSlug;
    if (!slug) return;
    if (event.target.closest('[data-project-source]')) {
      unlockSticker('repo-hunter');
      return;
    }
    if (event.target.closest('a')) return;
    openProjectBySlug(slug);
  }, [openProjectBySlug]);

  const handleCloseModal = useCallback(() => {
    closePanel();
    setSelectedSlug(null);
    if (querySlug) {
      router.replace('/projects');
    }
  }, [closePanel, querySlug, router]);

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
      <div className={className} onClick={handleGridClick}>
        {children}
      </div>
      <Suspense fallback={null}>
        <ProjectQuerySync onQuerySlug={handleQuerySlug} />
      </Suspense>
      {hasOpenedProject ? (
        <ProjectModal
          project={selectedSlug === null ? null : PROJECTS_BY_SLUG[selectedSlug]}
          onClose={handleCloseModal}
        />
      ) : null}
    </>
  );
}
