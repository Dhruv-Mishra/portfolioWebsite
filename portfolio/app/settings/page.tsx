'use client';

import { Volume2 } from 'lucide-react';
import MasterVolumeControl from '@/components/MasterVolumeControl';
import AskAboutIt from '@/components/AskAboutIt';
import SoundToggleButton from '@/components/SoundToggleButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WavyUnderline } from '@/components/ui/WavyUnderline';

export default function SettingsPage() {
  return (
    <main className="min-h-[100dvh] pt-16 md:pt-12 pb-24 px-4 md:px-8">
      <div className="mx-auto max-w-xl">
        <header className="text-center mb-8">
          <h1 className="font-hand text-4xl md:text-5xl font-bold text-[var(--c-heading)] inline-block">
            Settings
          </h1>
          <WavyUnderline className="max-w-xs mx-auto" />
          <p className="font-hand text-lg opacity-60 mt-2">
            sound, theme, and how the sketchbook behaves
          </p>
        </header>

        <section className="relative bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/50 rounded-lg p-5 md:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Volume2 size={18} className="text-[var(--c-ink)]/70" />
            <h2 className="font-hand text-xl font-bold text-[var(--c-heading)]">Sound</h2>
          </div>
          <p className="font-hand text-sm opacity-70 mb-4">
            Master volume for site sounds. Mute still lives on the speaker toggle.
          </p>
          <MasterVolumeControl />
          <div className="mt-4 flex items-center gap-3">
            <SoundToggleButton />
            <span className="font-hand text-sm opacity-70">Mute / unmute</span>
          </div>
        </section>

        <section className="relative mt-6 bg-[var(--c-paper)] border-2 border-dashed border-[var(--c-grid)]/50 rounded-lg p-5 md:p-6 shadow-sm">
          <h2 className="font-hand text-xl font-bold text-[var(--c-heading)] mb-3">Theme</h2>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="font-hand text-sm opacity-70">Light / dark</span>
          </div>
        </section>

        <div className="mt-8 text-center">
          <AskAboutIt page="settings" />
        </div>
      </div>
    </main>
  );
}
