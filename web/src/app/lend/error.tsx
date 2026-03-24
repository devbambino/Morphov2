"use client";

import { ReactNode } from "react";

export default function LendError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Lend MXNB</h1>
      <div className="bg-red-50 border border-red-200 rounded-xl shadow-sm p-8 text-center">
        <h2 className="text-xl font-bold text-red-900 mb-4">Error loading lend page</h2>
        <p className="text-red-700 mb-6">{error.message || "An error occurred while loading the lend functionality"}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
