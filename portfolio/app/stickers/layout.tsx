import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Sticker Drawer — Dhruv's Sketchbook",
  description:
    'A little achievement shelf — twelve sketchbook stickers you can earn by poking around the site. Collect them all.',
  openGraph: {
    title: "Sticker Drawer — Dhruv's Sketchbook",
    description:
      'Twelve hidden stickers, one sketchbook. Earn them by exploring.',
    type: 'website',
  },
  alternates: {
    canonical: '/stickers',
  },
};

export default function StickersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
