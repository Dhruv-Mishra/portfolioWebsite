import AstroClientShell from '@/components/AstroClientShell';
import MatrixNotesGate from '@/components/matrix/MatrixNotesGate';
import RoutePageShell from '@/components/routes/RoutePageShell';

export default function MatrixNotesRoute() {
  return (
    <AstroClientShell>
      <RoutePageShell>
        <MatrixNotesGate />
      </RoutePageShell>
    </AstroClientShell>
  );
}