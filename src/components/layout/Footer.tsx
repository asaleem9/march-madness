export function Footer() {
  return (
    <footer className="bg-navy text-cream-dark border-t-4 border-gold">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-display text-[0.5rem] text-gold tracking-wider">
            MARCH MADNESS 2026
          </p>
          <p className="font-body text-[0.65rem] text-cream-dark opacity-70">
            For entertainment purposes only. Not affiliated with the NCAA.
          </p>
        </div>
      </div>
    </footer>
  );
}
