"use client";

import { ReactNode } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-4xl mx-auto py-12">
      <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-red-900 mb-4">Something went wrong</h1>
        <p className="text-red-700 mb-6">{error.message || "An unexpected error occurred"}</p>
        <p className="text-sm text-red-600 mb-6 font-mono bg-red-100 p-3 rounded overflow-auto max-h-32">
          {error.digest}
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
