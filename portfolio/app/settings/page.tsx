import type { Metadata } from 'next';
import SettingsPanel from '@/components/SettingsPanel';

export const metadata: Metadata = {
  title: 'Settings | Dhruv Mishra',
  description: 'Appearance, accessibility, sound, sticker, and voice preferences for Dhruv Mishra\'s portfolio.',
  alternates: { canonical: '/settings' },
  openGraph: {
    title: 'Settings | Dhruv Mishra',
    description: 'Appearance, accessibility, sound, sticker, and voice preferences for Dhruv Mishra\'s portfolio.',
    url: 'https://whoisdhruv.com/settings',
  },
};

export default function SettingsPage() {
  return <SettingsPanel />;
}