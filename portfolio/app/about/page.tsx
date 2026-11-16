import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ExperienceTimeline from '@/components/ExperienceTimeline';
import AboutVoiceLink from '@/components/about/AboutVoiceLink';
import PinBoard, { type BoardNote } from '@/components/about/PinBoard';
import { ABOUT_PHOTO } from '@/lib/assets';
import { TAPE_CLIP_PATH } from '@/lib/constants';
import { PERSONAL_LINKS, SITE } from '@/lib/links';
import { RESUME_PDF_URL } from '@/lib/siteVersion';
import '@/components/about/about.css';

const PROFILE_PAGE_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  url: `${SITE.url}/about`,
  mainEntity: { '@id': `${SITE.url}/#person` },
});

const PAGE_STYLE = { '--tape-clip': TAPE_CLIP_PATH } as CSSProperties;
const RESUME_LINK = 'board-link focus-ring font-hand';

const NOTES: readonly BoardNote[] = [
  {
    id: 'bio',
    title: 'About me',
    heading: 'h1',
    paper: 'note',
    pin: 'red',
    torn: 'top',
    tilt: -1.2,
    clamp: true,
    cta: 'Read the whole note',
    ctaFits: 'Open note',
    body: (
      <>
        <p>
          I&apos;m Dhruv, a software engineer at Microsoft. I build AI agents and the Azure backend services they run on. My incident-triage agents cut manual on-call triage by 40%, and I trimmed $240K a year off the Azure bill of a backend serving 7 billion requests a day.
        </p>
        <p>
          After hours I build voice agents like <Link className="board-link focus-ring" href="/projects?project=invoke" prefetch={false}>Invoke</Link> and <Link className="board-link focus-ring" href="/projects?project=jarvis-voice-agent" prefetch={false}>Jarvis</Link>. I studied CS and Applied Math (Honors) at IIIT Delhi, compete as a Codeforces Expert, and spend the rest of my time lifting, playing chess and overclocking PCs.
        </p>
      </>
    ),
  },
  {
    id: 'photo',
    title: 'Hi, I\'m Dhruv',
    paper: 'photo',
    pin: 'blue',
    tilt: 3,
    cta: 'Look closer',
    body: (
      <Image
        src={ABOUT_PHOTO.src}
        alt={ABOUT_PHOTO.alt}
        width={420}
        height={420}
        unoptimized
        loading="eager"
        placeholder="blur"
        blurDataURL={ABOUT_PHOTO.blurDataURL}
        className="board-photo"
      />
    ),
  },
  {
    id: 'resume',
    anchor: 'resume',
    title: 'Resume',
    paper: 'index',
    pin: 'amber',
    tilt: 1.6,
    cta: 'What\u2019s on it',
    body: (
      <>
        <p>One page: Microsoft, IIIT Delhi, research and contests.</p>
        <div className="board-links">
          <a className={RESUME_LINK} href={RESUME_PDF_URL} download="Dhruv_Mishra_Resume.pdf">Download PDF</a>
          <a className={RESUME_LINK} href={RESUME_PDF_URL} target="_blank" rel="noopener noreferrer">Open in a new tab</a>
        </div>
      </>
    ),
    more: (
      <ul>
        <li>Software engineer at Microsoft since June 2024: AI agents and Azure backends.</li>
        <li>B.Tech (Honors) in CS and Applied Math, IIIT Delhi, CGPA 8.96.</li>
        <li>Codeforces Expert (peak 1703) and CodeChef 5-star (peak 2003).</li>
      </ul>
    ),
  },
  {
    id: 'contact',
    title: 'Say hello',
    paper: 'kraft',
    pin: 'white',
    tilt: -1.8,
    cta: 'Open card',
    body: (
      <address className="board-links not-italic">
        <a className="board-link focus-ring" href={PERSONAL_LINKS.email}>dhruvmishra.id@gmail.com</a>
        <a className="board-link focus-ring" href={PERSONAL_LINKS.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
        <a className="board-link focus-ring" href={PERSONAL_LINKS.phone}>+91 95993 77944</a>
      </address>
    ),
    more: <p>Questions about my work? <AboutVoiceLink /></p>,
  },
  {
    id: 'now',
    title: 'Right now',
    paper: 'note',
    pin: 'green',
    torn: 'bottom',
    tilt: 0.8,
    cta: 'More',
    body: <p>Shipping AI agents for on-call engineers at Microsoft, and voice agents after hours.</p>,
    more: (
      <p>
        The triage agents use MCP servers for Kusto, service health and config, with fallbacks and a human hand-off. See the <a className="board-link focus-ring" href="#experience">timeline below</a> for the rest.
      </p>
    ),
  },
  {
    id: 'hobbies',
    title: 'Off the clock',
    paper: 'pink',
    pin: 'red',
    tilt: -2.4,
    cta: 'Open',
    body: <p>Lifting, chess and overclocking PCs.</p>,
  },
  {
    id: 'voice',
    title: 'Ask AI Dhruv',
    paper: 'blue',
    pin: 'amber',
    tilt: 1.4,
    cta: 'Start a voice call',
    action: 'voice',
    body: <p>A voice agent that knows my work. Uses your mic.</p>,
  },
];

export default function About() {
  return (
    <div className="about-page" style={PAGE_STYLE}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: PROFILE_PAGE_LD }} />
      <section className="pinboard" aria-labelledby="board-bio-title">
        <div className="pinboard-surface">
          <PinBoard notes={NOTES} />
        </div>
      </section>
      <ExperienceTimeline />
    </div>
  );
}
