import { pageMetadata } from '@/lib/pageMetadata';

export const metadata = pageMetadata({
  title: 'Guestbook | Dhruv Mishra',
  description: 'Leave your mark on the wall: sign Dhruv\'s sketchbook guestbook and see notes from other visitors.',
  path: '/guestbook',
  socialDescription: 'Leave a note on the wall and see what others have written.',
});

export default function GuestbookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
