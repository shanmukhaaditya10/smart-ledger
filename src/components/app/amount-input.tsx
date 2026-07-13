"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Rupee amount input. Keeps a clean string (digits + optional single dot + up to
 * 2 decimals) so it can be sent straight to the API, which parses it into exact
 * integer paise. We never coerce to a float here.
 */
export function AmountInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  id?: string;
}) {
  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.]/g, "");
    // allow only one dot and max 2 decimals
    const parts = raw.split(".");
    let next = parts[0];
    if (parts.length > 1) next += "." + parts.slice(1).join("").slice(0, 2);
    onChange(next);
  }

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        ₹
      </span>
      <input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        value={value}
        onChange={handle}
        placeholder={placeholder}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-card pl-7 pr-3 py-2 text-sm shadow-sm tabular transition-colors",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:border-ring/60",
        )}
      />
    </div>
  );
}
