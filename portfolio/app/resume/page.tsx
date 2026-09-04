import { TAPE_STYLE_DECOR } from '@/lib/constants';
import { SHADOW_TOKENS } from '@/lib/designTokens';
import DeferredResumePdf from '@/components/DeferredResumePdf';
import ResumeOpenPdfButton from '@/components/ResumeOpenPdfButton';
import HomeVoiceNote from '@/components/voice/HomeVoiceNote';
import { RESUME_PDF_URL } from '@/lib/siteVersion';

export default function ResumePage() {
    return (
        <div className="h-full min-h-[24rem] px-1 py-2 pb-8 sm:px-4 md:min-h-[36rem] md:px-12 flex flex-col items-center justify-center relative z-10 box-border">
            <ResumeOpenPdfButton href={RESUME_PDF_URL} />
            <HomeVoiceNote
                label="Ask me about it"
                ariaLabel="Ask about this resume by voice"
                context={{ source: 'resume', topic: 'resume' }}
                className="mb-4"
            />
            {/* The Resume "Paper" */}
            <div
                className="animate-page-sheet relative h-full min-h-[22rem] w-full max-w-5xl bg-white p-[1px] shadow-2xl md:min-h-[32rem]"
                style={{
                    transform: 'rotate(-1deg)',
                    boxShadow: SHADOW_TOKENS.resume
                }}
            >
                {/* Tape - Top Left */}
                <div data-tape-strip className="absolute -top-3 -left-8 w-32 h-8 shadow-sm transform -rotate-[25deg] z-20 pointer-events-none" style={TAPE_STYLE_DECOR} />

                {/* Tape - Top Right */}
                <div data-tape-strip className="absolute -top-4 -right-8 w-32 h-8 shadow-sm transform rotate-[20deg] z-20 pointer-events-none" style={TAPE_STYLE_DECOR} />

                {/* Tape - Bottom Center */}
                <div data-tape-strip className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-40 h-10 shadow-sm transform rotate-[2deg] z-20 pointer-events-none" style={TAPE_STYLE_DECOR} />

                <div className="w-full h-full bg-white relative z-10 overflow-hidden">
                    <div className="w-full h-full relative">
                        <div className="hidden md:flex absolute left-4 bottom-4 z-20 pointer-events-none rounded-lg border border-yellow-200/70 bg-yellow-50/90 px-4 py-2 text-sm font-hand text-gray-700 shadow-md backdrop-blur-sm">
                            Scroll to browse the embedded PDF, or open it in a new tab for the smoothest reading experience.
                        </div>

                        <DeferredResumePdf />
                    </div>

                    <a
                        href={RESUME_PDF_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-4 right-4 z-30 hidden min-h-11 items-center md:flex group"
                        title="Open PDF in new tab"
                    >
                        <div className="bg-yellow-100 text-gray-800 min-h-11 px-5 py-2.5 rounded-lg shadow-lg border border-yellow-200/50 transform -rotate-2 group-hover:rotate-0 group-hover:scale-105 transition-[transform] font-hand font-bold flex items-center gap-2 text-lg">
                            <span>Open PDF</span>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                        </div>
                    </a>
                </div>
            </div>
        </div>
    );
}
