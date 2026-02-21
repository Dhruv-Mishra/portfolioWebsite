import React from 'react';

// Sketchy Window Control Scribbles (Red, Yellow, Green)
export const WindowControls = React.memo(function WindowControls() {
  return (
    <div className="flex gap-3 relative z-10 pl-2">
        {/* Red Scribble */}
        <div className="w-4 h-4 text-red-400/80 hover:text-red-400 transition-colors cursor-pointer">
            <svg viewBox="0 0 100 100" fill="currentColor"><path d="M50 5 Q80 5 90 30 Q95 60 70 85 Q40 95 15 70 Q5 40 20 15 Q35 5 50 5 Z" /></svg>
        </div>
        {/* Yellow Scribble */}
        <div className="w-4 h-4 text-amber-400/80 hover:text-amber-400 transition-colors cursor-pointer">
            <svg viewBox="0 0 100 100" fill="currentColor"><path d="M45 5 Q75 10 90 35 Q95 70 65 90 Q35 95 10 70 Q5 35 25 10 Q45 5 45 5 Z" /></svg>
        </div>
        {/* Green Scribble */}
        <div className="w-4 h-4 text-emerald-400/80 hover:text-emerald-400 transition-colors cursor-pointer">
            <svg viewBox="0 0 100 100" fill="currentColor"><path d="M55 5 Q85 15 90 45 Q85 80 55 90 Q25 85 15 55 Q10 25 40 10 Q55 5 55 5 Z" /></svg>
        </div>
    </div>
  );
});

// Realistic Thumbpin SVG
export const Thumbpin = ({ className }: { className?: string }) => (
    <div className={`pointer-events-none ${className}`}>
        <svg width="60" height="60" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Paper Indent/Shadow */}
            <ellipse cx="25" cy="28" rx="6" ry="3" fill="black" fillOpacity="0.2" filter="blur(2px)" />

            {/* Pin Head - Red Plastic Top View */}
            <circle cx="25" cy="25" r="12" fill="#dc2626" /> {/* Dark Red Base */}
            <circle cx="25" cy="25" r="11" fill="url(#pin-shine-top)" /> {/* Gradient Shine */}
            <circle cx="25" cy="25" r="12" stroke="#991b1b" strokeWidth="1" strokeOpacity="0.5" /> {/* Border */}

            {/* Center metal cap/dimple */}
            <circle cx="25" cy="25" r="4" fill="#b91c1c" />
            <circle cx="25" cy="25" r="3" fill="#ef4444" />

            {/* Glossy Highlight */}
            <path d="M25 16 A 9 9 0 0 1 32 20" stroke="white" strokeWidth="2" strokeOpacity="0.4" strokeLinecap="round" />
            <circle cx="20" cy="20" r="2" fill="white" fillOpacity="0.5" filter="blur(1px)" />

            <defs>
                <radialGradient id="pin-shine-top" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(20 18) rotate(45) scale(18)">
                    <stop stopColor="#fca5a5" />
                    <stop offset="1" stopColor="#b91c1c" />
                </radialGradient>
            </defs>
        </svg>
    </div>
);
