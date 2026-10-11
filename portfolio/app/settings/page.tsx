import SettingsPanel from '@/components/SettingsPanel';
import { pageMetadata } from '@/lib/pageMetadata';

export const metadata = pageMetadata({
  title: 'Settings | Dhruv Mishra',
  description: 'Appearance, accessibility, sound, sticker, and voice preferences for Dhruv Mishra\'s portfolio.',
  path: '/settings',
});

export default function SettingsPage() {
  return <SettingsPanel />;
}