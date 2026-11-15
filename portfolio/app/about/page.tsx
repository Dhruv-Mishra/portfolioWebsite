import Image from 'next/image';
import Link from 'next/link';
import { Thumbpin } from '@/components/DoodleIcons';
import ExperienceTimeline from '@/components/ExperienceTimeline';
import AboutVoiceLink from '@/components/about/AboutVoiceLink';
import { TapeStrip } from '@/components/ui/TapeStrip';
import { TAPE_STYLE_DECOR } from '@/lib/constants';
import { experienceTimelineEntries } from '@/lib/experienceTimeline';
import { PERSONAL_LINKS, SITE } from '@/lib/links';
import { RESUME_PDF_URL } from '@/lib/siteVersion';
import '@/components/about/about.css';

const PROFILE_PAGE_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  url: `${SITE.url}/about`,
  mainEntity: { '@id': `${SITE.url}/#person` },
});

export default function About() {
  return (
    <div className="about-spread">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: PROFILE_PAGE_LD }} />
      <section className="about-note bg-note-paper shadow-sticker" aria-labelledby="about-title">
        <div data-tape-strip aria-hidden="true" className="about-tape shadow-sm" style={TAPE_STYLE_DECOR} />
        <Thumbpin className="absolute -top-7 left-1/2 -translate-x-1/2" />
        <div
          data-hover-tilt
          data-tilt-3d="paper"
          data-disco-motion="wiggle"
          className="about-photo shadow-polaroid"
        >
          <TapeStrip size="sm" />
          <Image
            src="/resources/aboutPhoto.webp"
            alt="Dhruv Mishra"
            width={168}
            height={168}
            sizes="(min-width: 1024px) 168px, 96px"
            loading="eager"
            placeholder="blur"
            blurDataURL="data:image/webp;base64,UklGRjAAAABXRUJQVlA4ICQAAACQAQCdASoIAAgABUB8JZQAApt4/8AA/tAqOjucrquuceXgAAA="
            className="aspect-square w-full object-cover sepia-[.3]"
          />
        </div>
        <h1 id="about-title" className="about-title font-hand ink-heavy">About me</h1>
        <div className="about-copy font-body">
          <p>
            I&apos;m Dhruv, a software engineer at Microsoft. I build AI agents and the Azure backend services they run on. My incident-triage agents cut manual on-call triage by 40%, and I trimmed $240K a year off the Azure bill of a backend serving 7 billion requests a day.
          </p>
          <p>
            After hours I build voice agents like <Link className="about-link focus-ring" href="/projects?project=invoke" prefetch={false}>Invoke</Link> and <Link className="about-link focus-ring" href="/projects?project=jarvis-voice-agent" prefetch={false}>Jarvis</Link>. I studied CS and Applied Math (Honors) at IIIT Delhi, compete as a Codeforces Expert, and spend the rest of my time lifting, playing chess and overclocking PCs.
          </p>
        </div>
        <div id="resume" className="about-resume">
          <a className="about-download focus-ring font-hand shadow-sticker" href={RESUME_PDF_URL} download="Dhruv_Mishra_Resume.pdf">
            <TapeStrip size="sm" />
            Download resume (PDF)
          </a>
          <a className="about-link about-open focus-ring font-hand" href={RESUME_PDF_URL} target="_blank" rel="noopener noreferrer">Open in a new tab</a>
        </div>
        <address className="about-contact font-body not-italic">
          <a className="about-link focus-ring" href={PERSONAL_LINKS.email}>dhruvmishra.id@gmail.com</a>
          <a className="about-link focus-ring" href={PERSONAL_LINKS.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
          <a className="about-link focus-ring" href={PERSONAL_LINKS.phone}>+91 95993 77944</a>
        </address>
        <p className="about-voice font-body">Questions about my work? <AboutVoiceLink /></p>
      </section>
      <ExperienceTimeline entries={experienceTimelineEntries} />
    </div>
  );
}
