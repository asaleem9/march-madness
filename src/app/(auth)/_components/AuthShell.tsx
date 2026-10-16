/** Shared backdrop + card for the auth pages. */
export function AuthShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4 relative"
      style={{
        backgroundImage: "url(/images/auth-bg.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-cream/90" />
      <div className={`retro-card p-8 w-full max-w-md relative z-10 ${className}`}>
        {children}
      </div>
    </div>
  );
}

export const inputClass =
  "w-full border-2 border-navy p-3 font-body text-base bg-cream focus:outline-none focus:ring-2 focus:ring-gold";

export const labelClass = "font-display text-[0.6rem] text-navy block mb-2";
