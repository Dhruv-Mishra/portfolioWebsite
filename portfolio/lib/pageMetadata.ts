import type { Metadata } from 'next';
import { SITE } from '@/lib/links';

export const SITE_DESCRIPTION =
  'Software engineer at Microsoft building production AI agents and the Azure backend services they run on. Projects, resume, and a voice agent you can talk to.';

export const OG_IMAGE = {
  url: '/resources/og-image.png',
  width: 1200,
  height: 630,
  alt: 'Dhruv Mishra - Software Engineer Portfolio',
} as const;

const SITE_NAME = 'Dhruv Mishra Portfolio';

interface PageMetadataInput {
  title: string;
  description: string;
  path: `/${string}`;
  socialDescription?: string;
}

// Child segments replace (not merge) the root openGraph/twitter objects, so
// every page rebuilds them here to keep the shared preview image and site name.
export function pageMetadata({ title, description, path, socialDescription }: PageMetadataInput): Metadata {
  const social = socialDescription ?? description;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      siteName: SITE_NAME,
      url: `${SITE.url}${path === '/' ? '' : path}`,
      title,
      description: social,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: social,
      images: [OG_IMAGE.url],
    },
  };
}
