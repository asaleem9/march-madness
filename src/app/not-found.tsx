import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4">
      <div className="retro-card p-8 max-w-md w-full text-center">
        <Image
          src="/images/404.png"
          alt=""
          width={200}
          height={200}
          className="block mx-auto mb-4 rounded"
        />
        <h1 className="font-display text-navy text-lg mb-2">404</h1>
        <p className="font-display text-navy text-[0.6rem] mb-4">PAGE NOT FOUND</p>
        <p className="font-body text-sm text-navy/70 mb-6">
          Looks like this page got eliminated in the first round. If someone sent
          you a bracket link, it may have been deleted.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/leaderboard" className="retro-btn retro-btn-primary">
            Leaderboard
          </Link>
          <Link href="/schedule" className="retro-btn retro-btn-secondary">
            Schedule
          </Link>
          <Link href="/" className="retro-btn retro-btn-gold">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
