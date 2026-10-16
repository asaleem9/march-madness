"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4">
      <div className="retro-card p-8 max-w-md w-full text-center">
        <h1 className="font-display text-navy text-sm mb-3">TIMEOUT ON THE FLOOR</h1>
        <p className="font-body text-sm text-navy/70 mb-6">
          Something went wrong loading this page. The database may just be waking up.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button type="button" onClick={reset} className="retro-btn retro-btn-primary">
            Try again
          </button>
          <Link href="/" className="retro-btn retro-btn-secondary">
            Home
          </Link>
        </div>
        {error.digest && (
          <p className="font-body text-[0.65rem] text-navy/40 mt-4">Ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
