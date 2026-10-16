"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  id: string;
};

/**
 * Password field with an accessible show/hide toggle. The toggle is a 44px
 * target, announces state via aria-pressed, and never submits the form.
 */
export function PasswordInput({ id, className, ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        className={cn(
          "w-full border-2 border-navy p-3 pr-16 font-body text-base bg-cream focus:outline-none focus:ring-2 focus:ring-gold",
          className
        )}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={id}
        className="absolute right-0 top-0 h-full min-h-11 min-w-11 px-3 font-body text-xs font-bold text-navy/70 hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        {visible ? "HIDE" : "SHOW"}
      </button>
    </div>
  );
}
