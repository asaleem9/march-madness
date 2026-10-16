"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { AchievementType } from "@/types";
import { ACHIEVEMENT_INFO } from "@/lib/achievements";

interface BadgeLegendProps {
  badges: AchievementType[];
  /** Used in the toggle's accessible name: "Ali's badges". */
  ownerName: string;
}

/**
 * A player's badge icons. Tapping them reveals a small popover naming each
 * badge (hover titles don't work on touch), with a link to the full legend.
 */
export function BadgeLegend({ badges, ownerName }: BadgeLegendProps) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (badges.length === 0) return null;

  const labels = badges.map((b) => ACHIEVEMENT_INFO[b]?.label ?? b);

  return (
    <div ref={rootRef} className="relative z-10 inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`${ownerName}'s badges: ${labels.join(", ")}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1 rounded px-1 py-1 -mx-1 hover:bg-navy/5 focus-visible:outline-2 focus-visible:outline-gold"
      >
        {badges.map((b) => (
          <Image
            key={b}
            src={ACHIEVEMENT_INFO[b]?.icon ?? ""}
            alt=""
            width={20}
            height={20}
            className="rounded-sm"
          />
        ))}
      </button>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Badges"
          className="absolute left-0 top-full mt-1 w-64 bg-cream border-2 border-navy shadow-[4px_4px_0_var(--color-navy)] p-3 text-left"
        >
          <ul className="space-y-2">
            {badges.map((b) => {
              const info = ACHIEVEMENT_INFO[b];
              return (
                <li key={b} className="flex items-start gap-2">
                  <Image src={info?.icon ?? ""} alt="" width={20} height={20} className="rounded-sm mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-body text-xs font-bold text-navy">{info?.label ?? b}</div>
                    {info?.description && (
                      <div className="font-body text-xs text-navy/70">{info.description}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Link
            href="/scoring#badges"
            className="inline-block mt-3 font-body text-xs text-burnt-orange underline"
          >
            What are badges?
          </Link>
        </div>
      )}
    </div>
  );
}
