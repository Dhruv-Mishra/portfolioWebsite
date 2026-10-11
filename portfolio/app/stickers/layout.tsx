import { pageMetadata } from '@/lib/pageMetadata';

export const metadata = pageMetadata({
  title: "Sticker Drawer — Dhruv's Sketchbook",
  description: 'A little achievement shelf: twelve sketchbook stickers you can earn by poking around the site. Collect them all.',
  path: '/stickers',
  socialDescription: 'Twelve hidden stickers, one sketchbook. Earn them by exploring.',
});

export default function StickersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
