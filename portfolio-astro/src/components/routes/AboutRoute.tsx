import AstroClientShell from '@/components/AstroClientShell';
import AboutPage from '@/components/pages/AboutPage';
import RoutePageShell from '@/components/routes/RoutePageShell';

export default function AboutRoute() {
  return (
    <AstroClientShell>
      <RoutePageShell>
        <AboutPage />
      </RoutePageShell>
    </AstroClientShell>
  );
}