"use client";

import dynamic from "next/dynamic";

const DunkHero = dynamic(() => import("@/remotion/DunkHero"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[300px] bg-navy rounded-lg flex items-center justify-center">
      <span className="font-display text-gold text-xs animate-pulse">
        Loading...
      </span>
    </div>
  ),
});

export function HeroDynamic() {
  return <DunkHero />;
}
