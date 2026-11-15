import Link from 'next/link';
import FeaturedCarousel, { type FeaturedSlide } from '@/components/home/FeaturedCarousel';
import { FEATURED_PROJECT_SLUGS, PROJECTS, getProjectBySlug } from '@/lib/projects';

// Plain serializable slide data: no JSX descriptions or icons cross into the client bundle.
const SLIDES: readonly FeaturedSlide[] = FEATURED_PROJECT_SLUGS.map((slug) => {
  const project = getProjectBySlug(slug);
  return {
    slug,
    name: project.name,
    summary: project.summary,
    stack: project.stack.slice(0, 3).join(', '),
    year: project.year,
    image: project.image,
    blurDataURL: project.blurDataURL,
  };
});

export default function FeaturedProjects({ className }: { className?: string }) {
  return (
    <section aria-labelledby="featured-heading" className={className}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="featured-heading" className="font-hand ink-heavy text-[length:var(--t-h2)] leading-[var(--lh-snug)] text-[var(--c-heading)] md:text-[length:var(--t-h2-md)]">
          Featured projects
        </h2>
        <Link
          href="/projects"
          prefetch={false}
          className="inline-flex min-h-11 items-center font-hand text-lg text-[var(--c-ink-muted)] underline decoration-wavy decoration-[var(--c-ink-faint)] underline-offset-4 transition-colors hover:text-[var(--c-ink)] focus-ring"
        >
          See all {PROJECTS.length} projects
        </Link>
      </div>
      <FeaturedCarousel slides={SLIDES} />
    </section>
  );
}
