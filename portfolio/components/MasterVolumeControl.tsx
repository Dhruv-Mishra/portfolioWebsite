'use client';

import { useCallback } from 'react';
import { useSoundVolume, setSoundVolumeImperative } from '@/hooks/useStickers';
import { soundManager } from '@/lib/soundManager';
import { cn } from '@/lib/utils';

interface MasterVolumeControlProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export default function MasterVolumeControl({
  orientation = 'horizontal',
  className,
}: MasterVolumeControlProps) {
  const volume = useSoundVolume();
  const percent = Math.round(volume * 100);
  const vertical = orientation === 'vertical';

  const commit = useCallback((nextPercent: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(nextPercent)));
    const next = clamped / 100;
    setSoundVolumeImperative(next);
    soundManager.setVolume(next);
    soundManager.setMuted(next <= 0);
    if (next > 0) soundManager.play('button-click');
  }, []);

  return (
    <div className={cn('flex items-center gap-2 font-hand text-[var(--c-ink)]', vertical && 'flex-col', className)}>
      <span className="text-xs font-bold tracking-wide opacity-70 tabular-nums">
        {percent}%
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-label="Master volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent} percent`}
        aria-orientation={orientation}
        onChange={(event) => commit(Number(event.target.value))}
        className={cn(
          'accent-[var(--c-ink)] bg-[var(--c-grid)]/30',
          vertical ? 'h-24 w-3 appearance-none writing-mode-vertical' : 'w-40 h-2',
        )}
        style={vertical ? { writingMode: 'vertical-lr', direction: 'rtl' } : undefined}
      />
    </div>
  );
}
