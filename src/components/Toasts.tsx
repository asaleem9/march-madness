"use client";

import { useToastStore } from "@/hooks/useToast";

/** Bottom-centre stack of transient messages. Mounted once in the root layout. */
export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div
      className="fixed bottom-4 inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`toast toast-${t.kind} pointer-events-auto max-w-sm w-full sm:w-auto flex items-start gap-3`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="text-cream/60 hover:text-cream text-sm leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
