"use client";

import { useEffect, useState } from 'react';

const RESUME_PDF_URL = '/resources/resume.pdf';
const RESUME_PDF_EMBED_URL = `${RESUME_PDF_URL}#toolbar=0&navpanes=0&view=FitV`;

export default function DeferredResumePdf() {
    const [shouldLoadPdf, setShouldLoadPdf] = useState(false);

    useEffect(() => {
        if (shouldLoadPdf) return;

        const runtimeWindow = window as Window & {
            requestIdleCallback?: typeof window.requestIdleCallback;
            cancelIdleCallback?: typeof window.cancelIdleCallback;
        };
        const loadPdf = () => setShouldLoadPdf(true);

        if (runtimeWindow.requestIdleCallback) {
            const idleId = runtimeWindow.requestIdleCallback(loadPdf, { timeout: 1800 });
            return () => runtimeWindow.cancelIdleCallback?.(idleId);
        }

        const timeoutId = runtimeWindow.setTimeout(loadPdf, 1200);
        return () => runtimeWindow.clearTimeout(timeoutId);
    }, [shouldLoadPdf]);

    if (!shouldLoadPdf) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-5 bg-orange-50/50 p-8 text-center">
                <div className="h-56 w-full max-w-md rotate-[-1deg] border-2 border-dashed border-orange-200 bg-white/75 shadow-inner" aria-hidden="true" />
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={() => setShouldLoadPdf(true)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--c-ink)] px-5 py-2.5 font-hand text-lg font-bold text-[var(--c-paper)] shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    >
                        Preview Resume
                    </button>
                    <a
                        href={RESUME_PDF_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        download="Dhruv_Mishra_Resume.pdf"
                        className="inline-flex items-center gap-2 rounded-lg border border-yellow-300/60 bg-yellow-100 px-5 py-2.5 font-hand text-lg font-bold text-gray-800 shadow-md transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    >
                        Download PDF
                    </a>
                </div>
            </div>
        );
    }

    return (
        <object
            data={RESUME_PDF_EMBED_URL}
            type="application/pdf"
            className="block h-full w-full"
        >
            <div className="flex h-full flex-col items-center justify-center gap-6 bg-orange-50/50 p-8 text-center">
                <div className="max-w-md">
                    <p className="mb-2 font-hand text-xl text-gray-800">View Resume</p>
                    <p className="mb-6 font-code text-sm text-gray-500">
                        Your browser doesn&apos;t support inline PDF viewing.
                    </p>
                    <a
                        href={RESUME_PDF_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        download="Dhruv_Mishra_Resume.pdf"
                        aria-label="Download Dhruv Mishra's Resume (PDF)"
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--c-ink)] px-6 py-3 font-bold tracking-wide text-[var(--c-paper)] shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    >
                        <span>Download Resume</span>
                        <svg className="h-5 w-5 transition-transform group-hover:translate-y-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </a>
                </div>
            </div>
        </object>
    );
}