import fs from 'node:fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('homepage hero contract', () => {
  it('places one Talk to me CTA between the intro and the terminal', () => {
    const home = read('app/page.tsx');
    const homeNote = read('components/voice/HomeVoiceNote.tsx');
    const mounts = home.match(/<HomeVoiceNote\b/g) ?? [];
    const introIdx = home.indexOf(
      'and the Azure backend services they run on.',
    );
    const voiceIdx = home.indexOf('<HomeVoiceNote');
    const terminalIdx = home.indexOf('data-disco-home-terminal');

    expect(mounts).toHaveLength(1);
    expect(homeNote).toContain('Talk to me');
    expect(introIdx).toBeGreaterThan(-1);
    expect(voiceIdx).toBeGreaterThan(introIdx);
    expect(terminalIdx).toBeGreaterThan(voiceIdx);
  });

  it('names Dhruv, his role, and resume/email links before the terminal', () => {
    const home = read('app/page.tsx');
    const terminalIdx = home.indexOf('data-disco-home-terminal');

    expect(home.indexOf('>Dhruv Mishra</a>')).toBeGreaterThan(-1);
    expect(home.indexOf('a software engineer at Microsoft')).toBeGreaterThan(-1);
    expect(home.indexOf('href="/resume"')).toBeGreaterThan(-1);
    expect(home.indexOf('href="/resume"')).toBeLessThan(terminalIdx);
    expect(home.indexOf('href={PERSONAL_LINKS.email}')).toBeLessThan(terminalIdx);
  });

  it('keeps the large guestbook note and a quieter version badge, without the Hello World badge', () => {
    const home = read('app/page.tsx');

    expect(home).toContain('Sign my sketchbook');
    expect(home).toContain('href="/guestbook"');
    expect(home).not.toContain('animate-hero-badge-mirror');
    expect(home).not.toContain('bg-rose-100 text-rose-900');
    expect(home).toContain('{SITE_VERSION_LABEL}');
    expect(home).toContain('text-[11px]');
    expect(home).toContain('dark:text-amber-100/55');
  });
});
