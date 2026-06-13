import AstroClientShell from '@/components/AstroClientShell';
import HomePage from '@/components/pages/HomePage';
import RoutePageShell from '@/components/routes/RoutePageShell';

export default function HomeRoute() {
  return (
    <AstroClientShell>
      <RoutePageShell>
        <HomePage />
      </RoutePageShell>
    </AstroClientShell>
  );
}