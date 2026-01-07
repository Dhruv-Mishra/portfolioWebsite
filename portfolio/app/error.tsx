"use client";

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-paper">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, rotate: 1 }}
        animate={{ opacity: 1, scale: 1, rotate: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl w-full bg-note-yellow p-8 md:p-12 rounded-lg shadow-2xl transform relative"
      >
        {/* Tape decoration */}
        <div className="absolute -top-4 left-1/3 w-32 h-10 bg-white/80 backdrop-blur-sm shadow-sm transform -rotate-6" />
        
        <div className="text-center relative z-10">
          <motion.div
            animate={{ 
              rotate: [0, 10, -10, 10, 0],
              scale: [1, 1.1, 1, 1.1, 1]
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="inline-block mb-6"
          >
            <AlertTriangle size={100} className="text-amber-600 mx-auto" strokeWidth={2} />
          </motion.div>
          
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
            <motion.button
              type="button"
              whileHover={{ scale: 1.05, rotate: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={reset}
              className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-full font-hand font-bold text-xl shadow-lg hover:bg-indigo-700 transition-colors"
            >
              <RefreshCw size={24} />
              Try Again
            </motion.button>
            
            <motion.button
              type="button"
              whileHover={{ scale: 1.05, rotate: 2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.location.href = '/'}
              className="flex items-center gap-2 px-8 py-4 bg-white border-2 border-indigo-600 text-indigo-600 rounded-full font-hand font-bold text-xl shadow-lg hover:bg-indigo-50 transition-colors"
            >
              Go Home
            </motion.button>
          </div>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-gray-600 font-hand text-md"
          >
            <p>Error ID: {error.digest || 'N/A'}</p>
          </motion.div>
        </div>
        
        {/* Corner fold */}
        <div className="absolute bottom-0 right-0 w-16 h-16 overflow-hidden">
          <div className="absolute bottom-0 right-0 w-16 h-16 bg-gray-200 transform origin-bottom-right rotate-45 translate-x-8 translate-y-8" />
        </div>
      </motion.div>
    </div>
  );
}
