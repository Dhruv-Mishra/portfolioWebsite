"use client";

import React, { Component, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-paper">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full bg-note-yellow p-8 rounded-lg shadow-xl transform -rotate-1"
          >
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h1 className="text-3xl font-hand font-bold text-gray-900 mb-4">
                Oops! Something went wrong
              </h1>
              <p className="text-lg font-hand text-gray-700 mb-6">
                Don&apos;t worry, it&apos;s not your fault. The system encountered an unexpected error.
              </p>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <pre className="text-xs text-left bg-gray-900 text-gray-100 p-4 rounded overflow-auto mb-4 max-h-40">
                  {this.state.error.toString()}
                </pre>
              )}
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-3 bg-indigo-600 text-white rounded-full font-bold hover:bg-indigo-700 transition-colors transform hover:rotate-2"
              >
                Go Back Home
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}
