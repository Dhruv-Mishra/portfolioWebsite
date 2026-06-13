import AstroClientShell from '@/components/AstroClientShell';
import StickersPage from '@/components/pages/StickersPage';
import RoutePageShell from '@/components/routes/RoutePageShell';

export default function StickersRoute() {
  return (
    <AstroClientShell>
      <RoutePageShell>
        <StickersPage />
      </RoutePageShell>
    </AstroClientShell>
  );
}