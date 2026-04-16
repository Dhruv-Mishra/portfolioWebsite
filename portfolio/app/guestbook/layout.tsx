import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Guestbook | Dhruv Mishra',
  description: 'Leave your mark on the wall — sign Dhruv\'s sketchbook guestbook and see notes from other visitors.',
  alternates: {
    canonical: '/guestbook',
  },
  openGraph: {
    title: 'Guestbook | Dhruv Mishra',
    description: 'Leave a note on the wall and see what others have written.',
    url: 'https://whoisdhruv.com/guestbook',
  },
};

export default function GuestbookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
