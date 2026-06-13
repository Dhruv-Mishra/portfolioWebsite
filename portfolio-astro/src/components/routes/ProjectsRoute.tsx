import AstroClientShell from '@/components/AstroClientShell';
import ProjectsPage from '@/components/pages/ProjectsPage';
import RoutePageShell from '@/components/routes/RoutePageShell';

export default function ProjectsRoute() {
  return (
    <AstroClientShell>
      <RoutePageShell>
        <ProjectsPage />
      </RoutePageShell>
    </AstroClientShell>
  );
}