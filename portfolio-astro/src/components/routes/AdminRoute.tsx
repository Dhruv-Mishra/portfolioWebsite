import AstroClientShell from '@/components/AstroClientShell';
import AdminConsole from '@/components/admin/AdminConsole';
import NotFoundPage from '@/components/pages/NotFoundPage';
import RoutePageShell from '@/components/routes/RoutePageShell';

interface AdminRouteProps {
  isAuthorized: boolean;
}

export default function AdminRoute({ isAuthorized }: AdminRouteProps) {
  return (
    <AstroClientShell>
      <RoutePageShell>
        {isAuthorized ? <AdminConsole /> : <NotFoundPage />}
      </RoutePageShell>
    </AstroClientShell>
  );
}