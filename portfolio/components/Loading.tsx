interface LoadingSpinnerProps {
  message?: string;
}

// Pure CSS loading spinner — no framer-motion needed for the critical loading path
export function LoadingSpinner({ message = "Loading..." }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <div className="flex flex-col items-center gap-6 animate-[fadeIn_0.3s_ease-out]">
        {/* CSS-only spinner */}
        <div className="w-16 h-16 border-4 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-xl font-hand text-gray-600 dark:text-gray-400 animate-pulse">
          {message}
        </p>
      </div>
    </div>
  );
}
