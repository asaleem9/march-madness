// A small retro loader — a bouncing CSS basketball. Replaces bare "Loading..."
// text. Respects prefers-reduced-motion via the global media block in globals.css.
export function Loader({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-16"
      role="status"
      aria-live="polite"
    >
      <div
        className="css-basketball"
        style={{ animation: "basketball-bounce 0.9s ease-in-out infinite" }}
      >
        <span className="css-basketball-seams" />
      </div>
      <span className="font-display text-[0.6rem] text-navy/60">{label}…</span>
    </div>
  );
}
