"use client";

import dynamic from "next/dynamic";

const HeroPlayer = dynamic(() => import("@/remotion/HeroPlayer"), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-lg border-4 border-gold/60 bg-navy" style={{ aspectRatio: "600 / 300" }} />
  ),
});

export function HeroDynamic() {
  return <HeroPlayer />;
}
