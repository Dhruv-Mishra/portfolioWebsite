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
