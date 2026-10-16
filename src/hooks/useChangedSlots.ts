"use client";

import { create } from "zustand";

/** How long a changed card keeps its `.flash-update` class. */
export const FLASH_MS = 1500;

interface ChangedSlotsState {
  /** `game_slot`s whose row changed in the last realtime batch. */
  slots: number[];
  /** Replace the flashed set; it clears itself after FLASH_MS. */
  mark: (slots: number[]) => void;
  clear: () => void;
}

let clearTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Tiny bridge between `useRealtimeGames` (which learns which games changed)
 * and the schedule cards (which flash gold for a moment when their game did).
 */
export const useChangedSlots = create<ChangedSlotsState>((set) => ({
  slots: [],
  mark: (slots) => {
    if (slots.length === 0) return;
    set({ slots: Array.from(new Set(slots)) });
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      clearTimer = null;
      set({ slots: [] });
    }, FLASH_MS);
  },
  clear: () => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    set({ slots: [] });
  },
}));
