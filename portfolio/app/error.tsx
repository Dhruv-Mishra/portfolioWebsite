"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { TAPE_STYLE_DECOR } from '@/lib/constants';
import { reportError } from '@/lib/errorReporting';
import { requestPageTurnNavigation } from '@/lib/pageTurn';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
    reportError(error, { digest: error.digest, source: 'app/error.tsx' });
  }, [error]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-paper">
      <div className="animate-page-sheet max-w-2xl w-full bg-note-yellow p-8 md:p-12 rounded-lg shadow-2xl transform relative rotate-1">
        {/* Tape decoration */}
        <div data-tape-strip className="absolute -top-4 left-1/3 w-32 h-10 shadow-sm transform -rotate-6" style={TAPE_STYLE_DECOR} />
        
        <div className="text-center relative z-10">
          <div className="inline-block mb-6">
            <AlertTriangle size={100} className="text-amber-600 mx-auto" strokeWidth={2} />
          </div>
          
          <h1 className="text-5xl md:text-7xl font-hand font-bold text-gray-900 mb-4">
            Uh oh!
          </h1>
          
          <h2 className="text-2xl md:text-3xl font-hand font-bold text-gray-800 mb-6">
            Something went wrong
          </h2>
          
          <p className="text-lg md:text-xl font-hand text-gray-700 mb-8 leading-relaxed">
            Don&apos;t worry, it&apos;s not your fault! The system encountered an unexpected error. 
            This has been logged and I&apos;ll look into it.
          </p>
          
          {process.env.NODE_ENV === 'development' && (
            <div className="mb-8 p-4 bg-gray-900 rounded-lg text-left overflow-auto max-h-40">
              <pre className="text-xs text-gray-100 font-code">
                {error.message}
              </pre>
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-full font-hand font-bold text-xl shadow-lg hover:bg-indigo-700 transition-colors"
            >
              <RefreshCw size={24} />
              Try Again
            </button>
            
            <button
              type="button"
              onClick={() => requestPageTurnNavigation(router, { href: '/', mode: 'push' })}
              className="flex items-center gap-2 px-8 py-4 bg-white border-2 border-indigo-600 text-indigo-600 rounded-full font-hand font-bold text-xl shadow-lg hover:bg-indigo-50 transition-colors"
            >
              Go Home
            </button>
          </div>
          
          <div className="mt-8 text-gray-600 font-hand text-md">
            <p>Error ID: {error.digest || 'N/A'}</p>
          </div>
        </div>
        
        {/* Corner fold */}
        <div className="absolute bottom-0 right-0 w-16 h-16 overflow-hidden">
          <div className="absolute bottom-0 right-0 w-16 h-16 bg-gray-200 transform origin-bottom-right rotate-45 translate-x-8 translate-y-8" />
        </div>
      </div>
    </div>
  );
}
