import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4">
      <div className="retro-card p-8 max-w-md w-full text-center">
        <Image
          src="/images/404.png"
          alt="404 - eliminated"
          width={200}
          height={200}
          className="mx-auto mb-4 rounded"
        />
        <h1 className="font-display text-navy text-lg mb-2">404</h1>
        <p className="font-display text-navy text-[0.55rem] mb-6">
          PAGE NOT FOUND
        </p>
        <p className="font-body text-sm text-navy/70 mb-6">
          Looks like this page got eliminated in the first round.
        </p>
        <Link href="/" className="retro-btn retro-btn-primary inline-block">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
