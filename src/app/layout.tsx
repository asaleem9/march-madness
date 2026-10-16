import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Press_Start_2P, Space_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Toasts } from "@/components/Toasts";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { getSeason } from "@/lib/tournament";

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start",
  display: "swap",
  adjustFontFallback: false,
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-space-mono",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { displayYear, offSeason } = await getSeason();
  const title = `March Madness ${displayYear}`;
  return {
    title: { default: `${title} Bracket Challenge`, template: `%s · ${title}` },
    description: offSeason
      ? `Join the waitlist for the ${displayYear} NCAA Tournament bracket challenge. Compete with friends and track every game in retro style.`
      : `Fill out your bracket, compete with friends, and track the ${displayYear} NCAA Tournament in retro style.`,
    applicationName: "March Madness Bracket Challenge",
    icons: { icon: "/icons/icon-192.png", apple: "/apple-touch-icon.png" },
    openGraph: {
      title: `${title} Bracket Challenge`,
      description: `Pick winners, climb the leaderboard, and wager with friends.`,
      type: "website",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#1a1a2e",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className={`${pressStart.variable} ${spaceMono.variable}`}>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-3K3WJCJS6M"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-3K3WJCJS6M');
          `}
        </Script>
      </head>
      <body className="bg-texture grain-overlay min-h-screen flex flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>
          <Header initialUser={user} isAdmin={isAdminEmail(user?.email)} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <Toasts />
        </Providers>
      </body>
    </html>
  );
}
