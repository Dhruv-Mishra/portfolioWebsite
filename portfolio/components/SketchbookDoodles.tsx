import React from 'react';

export const CloudDoodle = React.memo(function CloudDoodle() {
    return (
        <div className="absolute top-24 left-2 md:top-16 md:left-20 text-[var(--d-slate)] -rotate-3 opacity-40 md:opacity-100">
            <svg width="50" height="30" className="md:w-[100px] md:h-[60px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "var(--d-stroke-width)" }} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.5 19c0-1.7-1.3-3-3-3h-1.1c-.1-2.6-2.2-4.7-4.8-4.7-2.3 0-4.3 1.7-4.7 3.9-.3-.1-.5-.2-.9-.2-2.2 0-4 1.8-4 4s1.8 4 4 4h14.5c1.4 0 2.5-1.1 2.5-2.5z" />
            </svg>
        </div>
    );
});

export const PencilDoodle = React.memo(function PencilDoodle() {
    return (
        <div className="hidden md:block absolute top-1/3 left-8 text-[var(--d-amber)] -rotate-45">
            <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "var(--d-stroke-width)" }} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
            </svg>
        </div>
    );
});

export const BugDoodle = React.memo(function BugDoodle() {
    return (
        <div className="hidden md:block absolute bottom-32 left-16 text-[var(--d-red)] rotate-12">
            <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "var(--d-stroke-width)" }} strokeLinecap="round" strokeLinejoin="round">
                <path d="m8 2 1.88 1.88" />
                <path d="M14.12 3.88 16 2" />
                <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
                <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
                <path d="M12 20v-9" />
                <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
                <path d="M6 13H2" />
                <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
                <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
                <path d="M22 13h-4" />
                <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
            </svg>
        </div>
    );
});

export const PaperPlaneDoodle = React.memo(function PaperPlaneDoodle() {
    return (
        <div className="absolute top-32 right-2 md:bottom-[15%] md:top-auto md:right-[5.5rem] text-[var(--d-blue)] -rotate-12 opacity-40 md:opacity-100">
            <svg width="32" height="32" className="md:w-[60px] md:h-[60px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: "var(--d-stroke-width)" }} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
        </div>
    );
});

export const SaturnDoodle = React.memo(function SaturnDoodle() {
    return (
        <div className="absolute bottom-24 left-4 md:bottom-[5%] md:left-auto md:right-[5%] text-[var(--d-purple)] rotate-12 opacity-40 md:opacity-100">
            <svg width="40" height="28" className="md:w-[70px] md:h-[50px]" viewBox="0 0 70 50" fill="none" stroke="currentColor" style={{ strokeWidth: "var(--d-stroke-width)" }}>
                <circle cx="35" cy="25" r="15" />
                <ellipse cx="35" cy="25" rx="30" ry="10" transform="rotate(-15 35 25)" />
            </svg>
        </div>
    );
});

export const HandDrawnArrow = React.memo(function HandDrawnArrow({ className }: { className?: string }) { return (
    <svg className={className} viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Shaft - Convex Swoop (Bowl shape) */}
        <path
            d="M20 20 Q 90 90 180 60"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
        />
        {/* Arrowhead - Pointing Right/Slightly Up from the swoop */}
        <path
            d="M180 60 L 150 50 M180 60 L 155 80"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
); });
