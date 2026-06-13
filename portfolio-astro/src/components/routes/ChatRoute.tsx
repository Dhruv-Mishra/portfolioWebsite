import AstroClientShell from '@/components/AstroClientShell';
import ChatPage from '@/components/pages/ChatPage';
import RoutePageShell from '@/components/routes/RoutePageShell';

export default function ChatRoute() {
  return (
    <AstroClientShell>
      <RoutePageShell>
        <ChatPage />
      </RoutePageShell>
    </AstroClientShell>
  );
}