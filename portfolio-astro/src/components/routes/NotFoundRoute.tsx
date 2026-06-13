import AstroClientShell from '@/components/AstroClientShell';
import NotFoundPage from '@/components/pages/NotFoundPage';
import RoutePageShell from '@/components/routes/RoutePageShell';

export default function NotFoundRoute() {
  return (
    <AstroClientShell>
      <RoutePageShell>
        <NotFoundPage />
      </RoutePageShell>
    </AstroClientShell>
  );
}