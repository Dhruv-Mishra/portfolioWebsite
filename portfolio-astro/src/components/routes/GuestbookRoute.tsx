import AstroClientShell from '@/components/AstroClientShell';
import GuestbookPage from '@/components/pages/GuestbookPage';
import RoutePageShell from '@/components/routes/RoutePageShell';
import type { GuestbookEntry } from '@/lib/guestbook';

interface GuestbookRouteProps {
  currentPage: number;
  entries: GuestbookEntry[];
}

export default function GuestbookRoute({ entries, currentPage }: GuestbookRouteProps) {
  return (
    <AstroClientShell>
      <RoutePageShell>
        <GuestbookPage entries={entries} currentPage={currentPage} />
      </RoutePageShell>
    </AstroClientShell>
  );
}